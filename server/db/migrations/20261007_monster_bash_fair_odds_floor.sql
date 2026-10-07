-- Monster Bash fair-odds floor: a winning bet pays at least its stake divided
-- by the pre-fight win chance of the monster it backed. Before this, a lone
-- bettor's winnings were capped at the other side's slice of the house seed,
-- so every unopposed bet lost coins on average however well it was picked.
--
-- The parimutuel payout still applies when a busy pool pays more. Anything
-- above the pot is new coins from the house, like the seed itself. Bouts
-- without a recorded win chance (pre-fight odds failed, or older bouts) are
-- settled by the pool alone.

ALTER TABLE public.monster_bash_matches
    ADD COLUMN IF NOT EXISTS pregame_p NUMERIC(4, 3);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'monster_bash_matches_pregame_p_range'
    ) THEN
        -- Strictly between 0 and 1 so dividing by either side's chance is safe.
        ALTER TABLE public.monster_bash_matches
            ADD CONSTRAINT monster_bash_matches_pregame_p_range
            CHECK (pregame_p IS NULL OR (pregame_p > 0 AND pregame_p < 1));
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_monster_bash_match(target_match_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    match_row public.monster_bash_matches;
    player_pool BIGINT;
    player_winning BIGINT;
    pool_total BIGINT;
    winning_pool BIGINT;
    winner_chance NUMERIC;
    refund_all BOOLEAN;
    open_bet RECORD;
    bet_payout BIGINT;
    new_balance BIGINT;
    settled_count INTEGER := 0;
    paid_out BIGINT := 0;
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
    INTO player_pool, player_winning
    FROM public.monster_bash_bets
    WHERE match_id = target_match_id
      AND status = 'open';

    pool_total := player_pool + match_row.house_seed_left + match_row.house_seed_right;
    winning_pool := player_winning + CASE
        WHEN match_row.winner = 0 THEN match_row.house_seed_left
        WHEN match_row.winner = 1 THEN match_row.house_seed_right
        ELSE 0
    END;
    winner_chance := CASE
        WHEN match_row.winner = 0 THEN match_row.pregame_p
        WHEN match_row.winner = 1 THEN 1 - match_row.pregame_p
    END;

    -- With a seed on both sides neither condition below can hold, so only a
    -- cancelled bout refunds; without seeds a one-sided pool is refunded.
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
            IF winner_chance IS NOT NULL THEN
                bet_payout := GREATEST(bet_payout, FLOOR(open_bet.amount / winner_chance)::BIGINT);
            END IF;
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
            paid_out := paid_out + bet_payout;
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
        'playerPool', player_pool,
        'winningPool', winning_pool,
        'winnerChance', winner_chance,
        'paidOut', paid_out,
        'refunded', refund_all AND settled_count > 0
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_monster_bash_match(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_monster_bash_match(BIGINT) TO service_role;
