-- WirtWare: rapid-fire WarioWare-style microgames (Godot web build hosted on GitHub Pages).
-- Score submissions look the game up by name, so it needs a games row before its
-- arcade leaderboard can take scores.

INSERT INTO public.games (name, display_name, description, is_active, url)
VALUES (
    'WirtWare',
    'WirtWare',
    'Thirteen tiny games, a few seconds each, faster and faster. How many can you win?',
    TRUE,
    'https://sclondon.github.io/WirtWare/build/index.html'
)
ON CONFLICT (name) DO UPDATE
SET is_active = TRUE,
    url = EXCLUDED.url;
