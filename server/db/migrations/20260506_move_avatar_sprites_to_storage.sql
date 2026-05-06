-- Avatar sprite files now live in the public Supabase Storage bucket
-- `avatar-sprites`; avatar_items.asset_path stores bucket-relative paths.

UPDATE public.avatar_items
SET asset_path = regexp_replace(asset_path, '^/avatar/', '')
WHERE asset_path LIKE '/avatar/%';
