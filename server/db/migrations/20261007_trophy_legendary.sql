-- The Trophy is the shop's prize piece: legendary, and 999,999 tickets (it went in as rare, at 200,
-- and was 1000 for a while).
-- Run by the server at start; harmless to run again.

UPDATE public.avatar_items
SET rarity = 'legendary', base_price = 999999
WHERE item_key = 'trophy' AND art_version = 3;
