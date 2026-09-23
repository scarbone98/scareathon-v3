-- Monster Bash betting: parimutuel pools. Winners split the whole pot in
-- proportion to their stake (no house cut; rounding fractions are dropped).
-- Everyone is refunded if a bout is cancelled or only one side has bets.
--
-- All coin movement happens inside these functions, in one transaction each,
-- and every movement is written to currency_transactions.

CREATE TABLE IF NOT EXISTS public.monster_bash_bets (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES public.monster_bash_matches (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    side SMALLINT NOT NULL,
    amount BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    payout BIGINT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    settled_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT monster_bash_bets_side_check CHECK (side IN (0, 1)),
    CONSTRAINT monster_bash_bets_amount_positive CHECK (amount > 0),
    CONSTRAINT monster_bash_bets_status_check CHECK (status IN ('open', 'won', 'lost', 'refunded')),
    CONSTRAINT monster_bash_bets_one_per_match UNIQUE (match_id, user_id)
);

-- A player's betting history.
CREATE INDEX IF NOT EXISTS idx_monster_bash_bets_user
    ON public.monster_bash_bets (user_id, created_at DESC);

-- Finding bouts that still owe payouts after a crash.
CREATE INDEX IF NOT EXISTS idx_monster_bash_bets_open
    ON public.monster_bash_bets (match_id)
    WHERE status = 'open';

ALTER TABLE public.monster_bash_bets ENABLE ROW LEVEL SECURITY;

-- Belt and braces: a bout can never debit or pay the same player twice.
CREATE UNIQUE INDEX IF NOT EXISTS currency_transactions_monster_bash_once
    ON public.currency_transactions (user_id, source_type, source_id)
    WHERE source_type IN ('monster_bash_bet', 'monster_bash_payout', 'monster_bash_refund')
      AND source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.place_monster_bash_bet(
    target_user_id UUID,
    target_match_id BIGINT,
    bet_side SMALLINT,
    bet_amount BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    match_row public.monster_bash_matches;
    new_balance BIGINT;
    new_bet_id BIGINT;
BEGIN
    IF bet_side NOT IN (0, 1) THEN
        RAISE EXCEPTION 'invalid_side';
    END IF;
    IF bet_amount IS NULL OR bet_amount <= 0 THEN
        RAISE EXCEPTION 'invalid_amount';
    END IF;

    -- FOR SHARE makes the server's "betting is over" update wait for this bet,
    -- so a bet is either in before the lock or rejected.
    SELECT * INTO match_row
    FROM public.monster_bash_matches
    WHERE id = target_match_id
    FOR SHARE;

    IF NOT FOUND OR match_row.status <> 'betting' OR now() >= match_row.betting_closes_at THEN
        RAISE EXCEPTION 'betting_closed';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.monster_bash_bets
        WHERE match_id = target_match_id AND user_id = target_user_id
    ) THEN
        RAISE EXCEPTION 'already_bet';
    END IF;

    PERFORM public.ensure_user_wallet(target_user_id);

    UPDATE public.user_wallets
    SET coin_balance = coin_balance - bet_amount,
        updated_at = now()
    WHERE user_id = target_user_id
      AND coin_balance >= bet_amount
    RETURNING coin_balance INTO new_balance;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'insufficient_funds';
    END IF;

    BEGIN
        INSERT INTO public.monster_bash_bets (match_id, user_id, side, amount)
        VALUES (target_match_id, target_user_id, bet_side, bet_amount)
        RETURNING id INTO new_bet_id;
    EXCEPTION WHEN unique_violation THEN
        -- Two requests racing past the check above. Aborting the whole call
        -- undoes the debit too.
        RAISE EXCEPTION 'already_bet';
    END;

    INSERT INTO public.currency_transactions (
        user_id, amount, balance_after, transaction_type, source_type, source_id, metadata
    )
    VALUES (
        target_user_id,
        -bet_amount,
        new_balance,
        'spend',
        'monster_bash_bet',
        target_match_id::TEXT,
        jsonb_build_object(
            'side', bet_side,
            'fighter', CASE WHEN bet_side = 0 THEN match_row.fighter_left ELSE match_row.fighter_right END
        )
    );

    RETURN jsonb_build_object('betId', new_bet_id, 'balance', new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_monster_bash_match(target_match_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    match_row public.monster_bash_matches;
    pool_total BIGINT;
    winning_pool BIGINT;
    refund_all BOOLEAN;
    open_bet RECORD;
    bet_payout BIGINT;
    new_balance BIGINT;
    settled_count INTEGER := 0;
BEGIN
    SELECT * INTO match_row
    FROM public.monster_bash_matches
    WHERE id = target_match_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'match_not_found';
    END IF;
    IF match_row.status NOT IN ('finished', 'cancelled') THEN
        RAISE EXCEPTION 'match_not_over';
    END IF;

    -- Only open bets count, so settling twice is a harmless no-op.
    SELECT COALESCE(SUM(amount), 0),
           COALESCE(SUM(amount) FILTER (WHERE side = match_row.winner), 0)
    INTO pool_total, winning_pool
    FROM public.monster_bash_bets
    WHERE match_id = target_match_id
      AND status = 'open';

    refund_all := match_row.status = 'cancelled'
        OR winning_pool = 0
        OR winning_pool = pool_total;

    FOR open_bet IN
        SELECT * FROM public.monster_bash_bets
        WHERE match_id = target_match_id
          AND status = 'open'
        ORDER BY id
        FOR UPDATE
    LOOP
        IF refund_all THEN
            bet_payout := open_bet.amount;
        ELSIF open_bet.side = match_row.winner THEN
            bet_payout := (open_bet.amount * pool_total) / winning_pool;
        ELSE
            bet_payout := 0;
        END IF;

        IF bet_payout > 0 THEN
            PERFORM public.ensure_user_wallet(open_bet.user_id);

            UPDATE public.user_wallets
            SET coin_balance = coin_balance + bet_payout,
                updated_at = now()
            WHERE user_id = open_bet.user_id
            RETURNING coin_balance INTO new_balance;

            INSERT INTO public.currency_transactions (
                user_id, amount, balance_after, transaction_type, source_type, source_id, metadata
            )
            VALUES (
                open_bet.user_id,
                bet_payout,
                new_balance,
                CASE WHEN refund_all THEN 'refund' ELSE 'earn' END,
                CASE WHEN refund_all THEN 'monster_bash_refund' ELSE 'monster_bash_payout' END,
                target_match_id::TEXT,
                jsonb_build_object('side', open_bet.side, 'stake', open_bet.amount)
            );
        END IF;

        UPDATE public.monster_bash_bets
        SET status = CASE
                WHEN refund_all THEN 'refunded'
                WHEN bet_payout > 0 THEN 'won'
                ELSE 'lost'
            END,
            payout = bet_payout,
            settled_at = now()
        WHERE id = open_bet.id;

        settled_count := settled_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'settled', settled_count,
        'pool', pool_total,
        'winningPool', winning_pool,
        'refunded', refund_all AND settled_count > 0
    );
END;
$$;

-- Only the game server (the owner) calls these.
REVOKE EXECUTE ON FUNCTION public.place_monster_bash_bet(UUID, BIGINT, SMALLINT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_monster_bash_match(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_monster_bash_bet(UUID, BIGINT, SMALLINT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_monster_bash_match(BIGINT) TO service_role;
