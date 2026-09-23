-- Monster Bash house seed: every bout the house puts a small stake on both
-- monsters, split by the pre-fight win chance. That way payouts start near the
-- odds, and a lone bettor (or a crowd all on one side) can still win.
--
-- The house isn't a wallet: its stake is created when it's needed and its
-- winnings simply disappear. Players can gain at most the losing side's seed
-- per bout. With both seeds at 0 the old rules apply (refund one-sided pools).

ALTER TABLE public.monster_bash_matches
    ADD COLUMN IF NOT EXISTS house_seed_left BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS house_seed_right BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'monster_bash_matches_house_seed_nonnegative'
    ) THEN
        ALTER TABLE public.monster_bash_matches
            ADD CONSTRAINT monster_bash_matches_house_seed_nonnegative
            CHECK (house_seed_left >= 0 AND house_seed_right >= 0);
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
        'paidOut', paid_out,
        'refunded', refund_all AND settled_count > 0
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_monster_bash_match(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_monster_bash_match(BIGINT) TO service_role;
