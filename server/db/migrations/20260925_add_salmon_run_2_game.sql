-- Salmon Run 2: a low-poly fish trick racer (Godot web build hosted on GitHub Pages).
-- Score submissions look the game up by name, so it needs a games row before its
-- arcade leaderboard can take scores.

INSERT INTO public.games (name, display_name, description, is_active, url)
VALUES (
    'Salmon Run 2',
    'Salmon Run 2',
    'Race a sockeye salmon down a jungle river, pulling tricks to drum & bass.',
    TRUE,
    'https://sclondon.github.io/SalmonRun2/build/index.html'
)
ON CONFLICT (name) DO UPDATE
SET is_active = TRUE,
    url = EXCLUDED.url;
