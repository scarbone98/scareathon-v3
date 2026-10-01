-- The "Kid" body is called "Torso". (The catalog, avatar_catalog.sql, says so too; this
-- brings the live table along without anyone having to run the catalog by hand.)
-- Run by the server at start; harmless to run again.

UPDATE public.avatar_items SET name = 'Torso' WHERE item_key = 'body_kid' AND name <> 'Torso';
