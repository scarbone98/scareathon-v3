-- The casino's house games (slots, roulette, monster racing, picture poker):
-- one row per round a player bets on. The server decides every outcome; these
-- functions only move the tickets, in one transaction each, and write every
-- movement to currency_transactions.
--
-- Most rounds are over at once (play_casino_round). Picture poker takes the
-- bet on the deal and pays on the draw, so its round stays 'open' in between,
-- with the cards in `state`.

CREATE TABLE IF NOT EXISTS public.casino_rounds (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    stake BIGINT NOT NULL,
    payout BIGINT,
    status TEXT NOT NULL DEFAULT 'open',
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    settled_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT casino_rounds_stake_positive CHECK (stake > 0),
    CONSTRAINT casino_rounds_payout_nonnegative CHECK (payout IS NULL OR payout >= 0),
    CONSTRAINT casino_rounds_status_check CHECK (status IN ('open', 'settled'))
);

-- A player has at most one round in progress per game.
CREATE UNIQUE INDEX IF NOT EXISTS casino_rounds_one_open
    ON public.casino_rounds (user_id, game)
    WHERE status = 'open';

-- Clearing out old finished rounds.
CREATE INDEX IF NOT EXISTS idx_casino_rounds_created
    ON public.casino_rounds (created_at);

ALTER TABLE public.casino_rounds ENABLE ROW LEVEL SECURITY;

-- Takes the stake and opens a round.
CREATE OR REPLACE FUNCTION public.open_casino_round(
    target_user_id UUID,
    round_game TEXT,
    round_stake BIGINT,
    round_state JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    new_balance BIGINT;
    new_round_id BIGINT;
BEGIN
    IF round_stake IS NULL OR round_stake <= 0 THEN
        RAISE EXCEPTION 'invalid_amount';
    END IF;

    PERFORM public.ensure_user_wallet(target_user_id);

    UPDATE public.user_wallets
    SET coin_balance = coin_balance - round_stake,
        updated_at = now()
    WHERE user_id = target_user_id
      AND coin_balance >= round_stake
    RETURNING coin_balance INTO new_balance;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'insufficient_funds';
    END IF;

    BEGIN
        INSERT INTO public.casino_rounds (user_id, game, stake, state)
        VALUES (target_user_id, round_game, round_stake, COALESCE(round_state, '{}'::jsonb))
        RETURNING id INTO new_round_id;
    EXCEPTION WHEN unique_violation THEN
        -- Aborting the whole call undoes the debit too.
        RAISE EXCEPTION 'round_in_progress';
    END;

    INSERT INTO public.currency_transactions (
        user_id, amount, balance_after, transaction_type, source_type, source_id, metadata
    )
    VALUES (
        target_user_id,
        -round_stake,
        new_balance,
        'spend',
        'casino_bet',
        new_round_id::TEXT,
        jsonb_build_object('game', round_game)
    );

    RETURN jsonb_build_object('roundId', new_round_id, 'balance', new_balance);
END;
$$;

-- Closes a player's open round and pays what it won (0 for a loss).
CREATE OR REPLACE FUNCTION public.settle_casino_round(
    target_user_id UUID,
    target_round_id BIGINT,
    round_payout BIGINT,
    round_state JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    round_row public.casino_rounds;
    new_balance BIGINT;
BEGIN
    IF round_payout IS NULL OR round_payout < 0 THEN
        RAISE EXCEPTION 'invalid_amount';
    END IF;

    SELECT * INTO round_row
    FROM public.casino_rounds
    WHERE id = target_round_id
      AND user_id = target_user_id
    FOR UPDATE;

    -- Only an open round pays, so settling twice can't pay twice.
    IF NOT FOUND OR round_row.status <> 'open' THEN
        RAISE EXCEPTION 'round_not_open';
    END IF;

    IF round_payout > 0 THEN
        UPDATE public.user_wallets
        SET coin_balance = coin_balance + round_payout,
            updated_at = now()
        WHERE user_id = target_user_id
        RETURNING coin_balance INTO new_balance;

        INSERT INTO public.currency_transactions (
            user_id, amount, balance_after, transaction_type, source_type, source_id, metadata
        )
        VALUES (
            target_user_id,
            round_payout,
            new_balance,
            'earn',
            'casino_payout',
            target_round_id::TEXT,
            jsonb_build_object('game', round_row.game, 'stake', round_row.stake)
        );
    ELSE
        SELECT coin_balance INTO new_balance
        FROM public.user_wallets
        WHERE user_id = target_user_id;
    END IF;

    UPDATE public.casino_rounds
    SET status = 'settled',
        payout = round_payout,
        state = COALESCE(round_state, state),
        settled_at = now()
    WHERE id = target_round_id;

    RETURN jsonb_build_object('roundId', target_round_id, 'balance', COALESCE(new_balance, 0));
END;
$$;

-- A round that's over as soon as it's bet on: stake out, winnings in.
CREATE OR REPLACE FUNCTION public.play_casino_round(
    target_user_id UUID,
    round_game TEXT,
    round_stake BIGINT,
    round_payout BIGINT,
    round_state JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    opened JSONB;
BEGIN
    opened := public.open_casino_round(target_user_id, round_game, round_stake, round_state);
    RETURN public.settle_casino_round(target_user_id, (opened ->> 'roundId')::BIGINT, round_payout, NULL);
END;
$$;

-- Only the game server (the owner) calls these.
REVOKE EXECUTE ON FUNCTION public.open_casino_round(UUID, TEXT, BIGINT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_casino_round(UUID, BIGINT, BIGINT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.play_casino_round(UUID, TEXT, BIGINT, BIGINT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_casino_round(UUID, TEXT, BIGINT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_casino_round(UUID, BIGINT, BIGINT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.play_casino_round(UUID, TEXT, BIGINT, BIGINT, JSONB) TO service_role;
