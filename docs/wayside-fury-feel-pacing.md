# Fury feel and pacing pass

Base: upstream main 90b6d4c (includes #35 and #38). Original sprites, vehicle geometry and assets remain unchanged. No HUD, settings or onboarding files are edited.

## Combat

Light enemy impacts request 45 ms; heavy impacts request 65 ms. At 60 Hz these freeze for three/four ticks (50/67 ms), within the requested 40–80 ms range. This avoids rounding a nominal 75 ms freeze up to five ticks (83 ms). Heavy boss impacts retain their strength before boss knockback attenuation. Hero impacts retain 40 ms guarded / 65 ms unguarded feedback. Non-boss stagger is 160 ms light / 220 ms heavy. Existing bounded hit/death particles and death tumbles are preserved. Damage-number pop is shared across 2D, county 3D and Space 3D. Shake scales from damage and honors reduced motion. Vibration uses the existing haptics preference, supports any input on capable devices, and catches unsupported hardware errors.

## Balance

Ordinary grunt baseline HP: 30 → 28 (tier growth stays +6). Shooter HP 24, boss HP 520, authored chapter-specific configurations and co-op HP scaling stay intact. Normal incoming damage multiplier: 1 → 0.95 before defense and guard; Hard stays 1.45. This offsets the added bodies without flattening bosses or Hard difficulty. Ordinary candy drops: 2–4 → 3–5; boss drops stay 35 and chip multipliers still apply. XP, level caps and server reward accounting are unchanged.

Sparse non-boss Blast encounters with up to six authored spawns (excluding the first room) gain up to two nearby grunts, capped at eight before existing co-op additions. New positions must pass collision and remain over 70 units from the entry spawn. Cleared rooms and guests never respawn these extras. Boss rooms, practice, later authored behavior encounters and night ambient populations are untouched.

## Roads and goals

Cached 18-unit tangent fillets feed the shared 2D/3D road ribbon and collision queries. Lane dashes follow continuous arc length across bends. Taxi movement uses a 19-unit conservative footprint (body diagonal plus curb clearance), slides along the road and emits speed-scaled curb feedback at most five times per second. Older curb-position saves recover to the nearest valid asphalt position. No vehicle drawing changes.

A renderer-owned chapter goal strip displays a progress bar and next unlock in both graphics modes. Combat-room clears fill segments; the chapter completion milestone owns the final segment. Optional room clears cannot prematurely claim the unlock. Shared co-op completion counts. The unreleased finale is labeled coming soon. The strip is suppressed during practice, dialogue, overlays and cinematics.

## Validation

Run lint, `tsc -b`, server unit tests, combat/road/feel regressions, the frozen original-art comparison and `scripts/check-wayside-fury-feel-browser.mjs`. Browser matrix: phone 390×844 DPR3 in 2D/3D; desktop 1440×900 DPR2 in 2D. Long desktop 3D is excluded. Browser frame timings are observations on the test host, not a hardware-phone 60fps certification; the simulation remains fixed at 60 Hz, road geometry is cached and effects stay bounded.
