-- Prevent duplicate coin grants for the same user's weekly challenge reward.

CREATE UNIQUE INDEX IF NOT EXISTS currency_transactions_weekly_challenge_once
    ON public.currency_transactions (user_id, source_type, source_id)
    WHERE source_type = 'weekly_challenge'
      AND source_id IS NOT NULL;
