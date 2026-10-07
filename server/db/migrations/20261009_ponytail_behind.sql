-- The Ponytail hung in front of the face: the avatars face right, so the tail goes on the left, behind
-- (and it now swings on both frames it's meant to). Its redrawn strip and picture, under new addresses.
-- The row from avatar_catalog.sql (npm run art:avatar). Run by the server at start; harmless to run again.

UPDATE public.avatar_items SET asset_path = '/avatar-px/items/hair_ponytail/icon.png?v=ae0a26d811', parts = '[{"slot":"hair","anchor":"head","x":8,"y":24,"w":12,"h":9,"frames":4,"src":"/avatar-px/items/hair_ponytail/0-hair.png?v=e95a83bae5","fits":["body_kid"]}]'::jsonb WHERE item_key = 'hair_ponytail';
