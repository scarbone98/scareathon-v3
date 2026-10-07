-- Long Locks: on one frame of its sway the crown of the head showed through, one pixel at the
-- upper left. The redrawn strip, under its new address so nobody keeps the old one cached.
-- Run by the server at start; harmless to run again.

UPDATE public.avatar_items
SET parts = '[{"slot":"hair","anchor":"head","x":10,"y":25,"w":11,"h":14,"frames":6,"src":"/avatar-px/items/hair_long_locks/0-hair.png?v=6579bafa68","fits":["body_kid"]}]'::jsonb
WHERE item_key = 'hair_long_locks';
