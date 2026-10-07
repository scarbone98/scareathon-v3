-- The Trophy is the shop's prize piece: legendary, and 1000 tickets (it went in as rare, at 200).
-- Run by the server at start; harmless to run again.

UPDATE public.avatar_items
SET rarity = 'legendary', base_price = 1000
WHERE item_key = 'trophy' AND art_version = 3;
