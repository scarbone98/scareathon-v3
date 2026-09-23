-- Stores browser-generated composite avatar PNGs for lightweight profile display.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatar-composites',
    'avatar-composites',
    TRUE,
    1048576,
    ARRAY['image/png']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'Avatar composites are publicly readable'
    ) THEN
        CREATE POLICY "Avatar composites are publicly readable"
        ON storage.objects
        FOR SELECT
        USING (bucket_id = 'avatar-composites');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'Users can create their avatar composite'
    ) THEN
        CREATE POLICY "Users can create their avatar composite"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
            bucket_id = 'avatar-composites'
            AND name = (auth.uid()::text || '.png')
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'Users can update their avatar composite'
    ) THEN
        CREATE POLICY "Users can update their avatar composite"
        ON storage.objects
        FOR UPDATE
        TO authenticated
        USING (
            bucket_id = 'avatar-composites'
            AND name = (auth.uid()::text || '.png')
        )
        WITH CHECK (
            bucket_id = 'avatar-composites'
            AND name = (auth.uid()::text || '.png')
        );
    END IF;
END;
$$;
