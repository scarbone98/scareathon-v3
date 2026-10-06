-- The Jack-o'-Lantern Head is a mask now, not a hat: it's filed (and filtered in the shop) with
-- the face paint, masks and glasses, and a hat can go on top of it. Anyone wearing it with
-- another mask or pair of glasses has that one taken off (it was hidden under the pumpkin
-- anyway, and they still own it): only one can be worn at a time. Run by the server at start;
-- harmless to run again.

UPDATE public.avatar_items
SET category = 'face_acc',
    slot = 'face_acc',
    equip_group = 'face_acc'
WHERE item_key = 'jack_o_lantern_head'
  AND art_version = 3;

DELETE FROM public.user_outfit_items uoi
USING public.avatar_items ai
WHERE ai.id = uoi.item_id
  AND ai.art_version = 3
  AND ai.category = 'face_acc'
  AND ai.item_key <> 'jack_o_lantern_head'
  AND EXISTS (
      SELECT 1
      FROM public.user_outfit_items worn
      JOIN public.avatar_items pumpkin ON pumpkin.id = worn.item_id
      WHERE worn.user_id = uoi.user_id
        AND pumpkin.item_key = 'jack_o_lantern_head'
  );
