-- Things worn on the back (backpack, quiver, jetpack, devil tail, katana) were drawn past the chest: the
-- avatars face right, so they go on the left, behind. Each item's redrawn parts and picture, under new
-- addresses. Rows from avatar_catalog.sql (npm run art:avatar). Run by the server at start; harmless to run again.

UPDATE public.avatar_items SET asset_path = '/avatar-px/items/backpack/icon.png?v=ae74abb7d9', parts = '[{"slot":"back","anchor":"body","x":10,"y":34,"w":4,"h":5,"frames":1,"src":"/avatar-px/items/backpack/0-back.png?v=03baf994f8","fits":["body_kid"]}]'::jsonb WHERE item_key = 'backpack';
UPDATE public.avatar_items SET asset_path = '/avatar-px/items/quiver/icon.png?v=340b5be3d4', parts = '[{"slot":"back","anchor":"body","x":10,"y":31,"w":4,"h":7,"frames":1,"src":"/avatar-px/items/quiver/0-back.png?v=b8d9f1b3d6","fits":["body_kid"]}]'::jsonb WHERE item_key = 'quiver';
UPDATE public.avatar_items SET asset_path = '/avatar-px/items/jetpack/icon.png?v=75a05dff4e', parts = '[{"slot":"back","anchor":"body","x":10,"y":33,"w":4,"h":7,"frames":6,"src":"/avatar-px/items/jetpack/0-back.png?v=fa61dc2d5c","fits":["body_kid"]}]'::jsonb WHERE item_key = 'jetpack';
UPDATE public.avatar_items SET asset_path = '/avatar-px/items/devil_tail/icon.png?v=2440086344', parts = '[{"slot":"back","anchor":"body","x":7,"y":35,"w":6,"h":7,"frames":6,"src":"/avatar-px/items/devil_tail/0-back.png?v=57dc2b7afb","fits":["body_kid"]}]'::jsonb WHERE item_key = 'devil_tail';
UPDATE public.avatar_items SET asset_path = '/avatar-px/items/katana/icon.png?v=b30ff2b3b9', parts = '[{"slot":"back","anchor":"body","x":7,"y":24,"w":16,"h":16,"frames":1,"src":"/avatar-px/items/katana/0-back.png?v=12b242c2d0","fits":["body_kid"]}]'::jsonb WHERE item_key = 'katana';
