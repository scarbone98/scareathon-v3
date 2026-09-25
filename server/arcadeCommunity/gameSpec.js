// What a community arcade game has to look like: the manifest rules, and the
// spec document authors (and their AIs, via GET /arcade/spec) build against.

export const SPEC_VERSION = 1;

export const NAME_MAX = 40;
export const TAGLINE_MAX = 60;
export const DESCRIPTION_MAX = 500;
export const CONTROLS_MAX = 200;
export const URL_MAX = 500;
// Same ceiling as the highest built-in game (Horde Rush)
export const SCORE_MAX_CEILING = 1_000_000_000;
// Time scores are whole seconds; a day is plenty
export const TIME_SCORE_MAX_CEILING = 86_400;

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 '’!?&:.,-]*$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const ASPECT_PATTERN = /^(\d{1,2}):(\d{1,2})$/;

// Mirrors normalizeMachineName in src/pages/Arcade/games.tsx: two games whose
// names normalise the same would share a ?game= link.
export function normalizeGameName(name) {
    return String(name)
        .toLowerCase()
        .replace(/[’‘]/g, "'")
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '');
}

export function slugifyGameName(name) {
    return String(name)
        .toLowerCase()
        .replace(/[’‘']/g, '')
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function isHttpsUrl(value) {
    if (typeof value !== 'string' || value.length > URL_MAX) return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
        return false;
    }
}

function optionalString(errors, manifest, key, max) {
    const value = manifest[key];
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') {
        errors.push(`${key} must be a string`);
        return undefined;
    }
    const trimmed = value.trim();
    if (trimmed.length > max) errors.push(`${key} must be at most ${max} characters`);
    return trimmed;
}

// Checks a submitted manifest and returns it cleaned up (trimmed, defaults
// filled in) or the list of everything wrong with it.
export function validateManifest(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { ok: false, errors: ['manifest must be a JSON object'] };
    }

    const errors = [];
    const manifest = {};

    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (name.length < 3 || name.length > NAME_MAX) {
        errors.push(`name must be 3-${NAME_MAX} characters`);
    } else if (!NAME_PATTERN.test(name)) {
        errors.push("name may only use letters, numbers, spaces and ' ! ? & : . , -");
    }
    manifest.name = name;

    if (!isHttpsUrl(input.url)) {
        errors.push('url must be an https:// URL (no username/password)');
    }
    manifest.url = typeof input.url === 'string' ? input.url.trim() : input.url;

    const tagline = typeof input.tagline === 'string' ? input.tagline.trim() : '';
    if (!tagline || tagline.length > TAGLINE_MAX) {
        errors.push(`tagline is required, at most ${TAGLINE_MAX} characters`);
    }
    manifest.tagline = tagline;

    if (typeof input.color !== 'string' || !COLOR_PATTERN.test(input.color)) {
        errors.push('color must be a hex colour like "#6cc04a"');
    }
    manifest.color = typeof input.color === 'string' ? input.color.toLowerCase() : input.color;

    const aspectRatio = input.aspectRatio ?? '16:9';
    const aspectMatch = typeof aspectRatio === 'string' ? ASPECT_PATTERN.exec(aspectRatio) : null;
    const ratio = aspectMatch ? Number(aspectMatch[1]) / Number(aspectMatch[2]) : NaN;
    if (!aspectMatch || !(ratio >= 0.4 && ratio <= 2.5)) {
        errors.push('aspectRatio must look like "16:9" or "9:16" (between 2:5 and 5:2)');
    }
    manifest.aspectRatio = aspectRatio;

    if (input.mobile !== undefined && typeof input.mobile !== 'boolean') {
        errors.push('mobile must be true or false');
    }
    manifest.mobile = input.mobile === true;

    const description = optionalString(errors, input, 'description', DESCRIPTION_MAX);
    if (description) manifest.description = description;
    const controls = optionalString(errors, input, 'controls', CONTROLS_MAX);
    if (controls) manifest.controls = controls;

    if (input.coverImageUrl !== undefined && input.coverImageUrl !== null && input.coverImageUrl !== '') {
        if (!isHttpsUrl(input.coverImageUrl)) {
            errors.push('coverImageUrl must be an https:// URL');
        } else {
            manifest.coverImageUrl = input.coverImageUrl.trim();
        }
    }

    // No score block: the game has no leaderboard
    if (input.score !== undefined && input.score !== null) {
        const score = input.score;
        if (typeof score !== 'object' || Array.isArray(score)) {
            errors.push('score must be an object like { "format": "points", "max": 1000000 }');
        } else {
            const format = score.format ?? 'points';
            if (format !== 'points' && format !== 'time') {
                errors.push('score.format must be "points" or "time"');
            }
            const ceiling = format === 'time' ? TIME_SCORE_MAX_CEILING : SCORE_MAX_CEILING;
            if (!Number.isInteger(score.max) || score.max < 1 || score.max > ceiling) {
                errors.push(`score.max must be a whole number from 1 to ${ceiling.toLocaleString('en-US')}`);
            }
            const integer = format === 'time' ? true : score.integer !== false;
            manifest.score = { format, max: score.max, integer };
        }
    }

    return errors.length ? { ok: false, errors } : { ok: true, manifest };
}

// The score rule submitScore enforces, in the shape GAME_SCORE_POLICIES uses.
export function scorePolicyFromManifest(manifest) {
    if (!manifest?.score) return null;
    return { min: 0, max: manifest.score.max, integer: manifest.score.integer !== false };
}

export const SDK_SNIPPET = `<!-- Scareathon arcade hookup: paste before </body>, or load
     https://www.scareathon.rip/arcade-sdk.js -->
<script>
  window.ScareathonArcade = {
    inArcade: window.parent !== window,
    // Call once the game can be played (after loading screens).
    ready: function () {
      if (window.parent !== window) window.parent.postMessage({ type: "ARCADE_READY", specVersion: 1 }, "*");
    },
    // Call once per run, when it ends. score: a whole number >= 0.
    gameOver: function (score) {
      if (window.parent !== window) window.parent.postMessage({ type: "PLAYER_DIED", score: Math.floor(Number(score) || 0) }, "*");
    },
  };
</script>`;

export const EXAMPLE_MANIFEST = {
    name: 'Pumpkin Panic',
    url: 'https://yourname.github.io/pumpkin-panic/',
    tagline: 'Catch the pumpkins before midnight.',
    description: 'Pumpkins fall faster every level. Miss three and it is over.',
    color: '#f2a93b',
    aspectRatio: '16:9',
    mobile: true,
    controls: 'Arrow keys or drag to move the basket.',
    coverImageUrl: 'https://yourname.github.io/pumpkin-panic/cover.jpg',
    score: { format: 'points', max: 1000000 },
};

export const SPEC_MARKDOWN = `# Scareathon Arcade: game spec v${SPEC_VERSION}

Community games run on the Scareathon arcade shelf at https://www.scareathon.rip/arcade,
next to the house games, with the same leaderboards.

## How submitting works
1. Build and host the game yourself (GitHub Pages, itch.io HTML5, Netlify, ...).
2. Submit its URL and a manifest (below). Automated checks run straight away; if a
   check fails the submit is refused and nothing is saved.
3. A new game is saved as a **draft**. Only you and the Scareathon admins can play
   it, from https://www.scareathon.rip/profile/developer. Scores from a draft preview
   are shown to you but never saved.
4. An admin plays it and approves or rejects it (with a note). Submitting again
   before review replaces the waiting draft.
5. Approved: it's on the shelf and its leaderboard is live.
6. A game only needs approving once. To update it, submit again with the same
   name: once the automated checks pass, the new version goes live straight away.
   (If an admin takes a game off the shelf, updates wait for review again.)
   Tip: put a version in the URL (e.g. \`?v=2\`) so players don't get a stale cache.

## Technical requirements (checked automatically)
- A single web page at an **https** URL that plays in a browser with no install.
- It must allow being shown in an iframe: no \`X-Frame-Options: DENY/SAMEORIGIN\`,
  and any CSP \`frame-ancestors\` must allow https://www.scareathon.rip.
- It must not redirect to a different site. Submit the final URL.
- It answers 200 with an HTML page within 10 seconds.

## Runtime rules (checked by the reviewer)
- It runs in a sandboxed iframe: scripts, its own storage, pointer lock and fullscreen
  work; popups, top-level navigation and downloads don't.
- It fills whatever size it's given (resize with the window) at the
  \`aspectRatio\` from the manifest. On phones it gets the whole screen.
- No logins, ads, payments, external links that take players away, or data collection.
- Halloween-appropriate, no gore beyond a spooky-movie PG-13, nothing hateful.
- Audio should wait for the first click/tap (browsers block it before that anyway).
- If \`mobile\` is true, it must be fully playable by touch.

## Scores and the leaderboard
Tell the arcade about each finished run with \`postMessage\`. The arcade saves the
score for the signed-in player (guests are asked to sign in).

\`\`\`html
${SDK_SNIPPET}
\`\`\`

- Call \`ScareathonArcade.ready()\` once the game is playable.
- Call \`ScareathonArcade.gameOver(score)\` exactly once per run, when it ends.
  score is a whole number >= 0 and <= the manifest's \`score.max\`; higher is better.
- For \`"format": "time"\`, send whole seconds survived (higher is better).
- Out-of-range scores are thrown away. Leave \`score\` out of the manifest if the
  game has no leaderboard.

## Manifest
\`\`\`json
${JSON.stringify(EXAMPLE_MANIFEST, null, 2)}
\`\`\`

| field | required | rules |
|---|---|---|
| name | yes | 3-${NAME_MAX} chars; letters, numbers, spaces, \`' ! ? & : . , -\`. Fixed after the first submit; submit the same name to update. Must not clash with another arcade game. |
| url | yes | https URL of the playable page |
| tagline | yes | at most ${TAGLINE_MAX} chars, shown on the cartridge card |
| color | yes | \`#rrggbb\`, the cartridge label colour |
| aspectRatio | no | \`"W:H"\`, default \`"16:9"\` |
| mobile | no | \`true\` if it plays by touch on a phone, default \`false\` (hidden on phones) |
| description | no | at most ${DESCRIPTION_MAX} chars |
| controls | no | at most ${CONTROLS_MAX} chars |
| coverImageUrl | no | https image for the cartridge label, ideally 16:9, served with \`Access-Control-Allow-Origin: *\` (GitHub Pages does this) |
| score | no | \`{ "format": "points" or "time", "max": whole number }\`. max is at most ${SCORE_MAX_CEILING.toLocaleString('en-US')} for points, ${TIME_SCORE_MAX_CEILING.toLocaleString('en-US')} for time. Leave out for no leaderboard. |
`;

export function getSpecPayload() {
    return {
        specVersion: SPEC_VERSION,
        markdown: SPEC_MARKDOWN,
        sdkSnippet: SDK_SNIPPET,
        exampleManifest: EXAMPLE_MANIFEST,
    };
}
