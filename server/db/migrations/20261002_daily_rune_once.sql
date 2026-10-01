-- The rune tablet's daily code pays out once per player per day (source_id is the day).
-- Run by the server at start (IF NOT EXISTS, so harmless every time).

CREATE UNIQUE INDEX IF NOT EXISTS currency_transactions_daily_rune_once
    ON public.currency_transactions (user_id, source_type, source_id)
    WHERE source_type = 'daily_rune'
      AND source_id IS NOT NULL;
