# Sightline intro v2 — SPEC

GOAL:   In 36 s a founder feels "this is a premium product" and knows it audits everything before launch.
OUTPUT: HyperFrames, 1920×1080, 30 fps. 36 s = 1080 frames. Music "Vibrant Momentum" (137 BPM, 0.438 s/beat), drop on 4.50.

REFERENCES (user's own, measured from frame sheets):
- ref 3 (15 s): giant frosted-glass prompt pill typing letter-by-letter while the camera pulls back; pixel-dissolve after a
  button press; glossy 3D objects over photographic skies; kinetic headline letter-by-letter with blur wave; dark frosted
  panel over a landscape with lines typing, one highlighted, lifted as a chip, cursor click; zoom through a glowing circle
  into a dark end card. Shots 1.5–2 s, motion inside every shot.
- ref 2 (8 s): live UI performing (chart draws, badge counts, point rides the curve); 3D monitor on a deep blue→violet stage;
  sparkle labels blur in at different depths; flanking words whip away; object morphs card → loading bar → panel on lavender
  glass; cursor drags a file card into an upload slot with tilt.
- ref 1 (10 s): corner wordmark, sparkle glyph, tilted UI sweeps, big cursor clicks.

LOOK:   Photographic grounds (CC0): blue cumulus sky, pink sunset, misty hills. Deep stage #070F2E with radial glows #0066CC 55%
        and #6E50FF 50% (ref 2). Lavender glass ground #E9ECFF→#F6EFFF (ref 2). Glass: rgba(255,255,255,.62) + backdrop blur 28 px
        saturate 170%, 1.5 px white 85% border, shadow 0 40 px 100 px rgba(10,40,90,.25); dark glass rgba(16,18,28,.45).
        Ink #1D1D1F on light, #FFFFFF on dark. Accent Action Blue #0066CC (#2997FF on dark) on one element per shot.
        Status colours only for real status: good #30D158/#1F9D55, average #FF9F0A/#C77700, poor #FF453A/#D93025.
        Inter 600–700, headlines 96–120 px tracking −3%; UI text ≥ 26 px.
OBJECTS: real 3D iPhone 15 Pro + MacBook Pro (GLTF, registry `vfx-iphone-device`); cursor 76 px white arrow; logo as live vector.
DATA:   all from the real audit of the Sightline website: overall 77; Lighthouse 68/93/64/100; FCP 2.5 s, LCP 2.5 s, TBT 1.54 s,
        CLS 0, SI 2.6 s; memory 2.40→2.42 MB over 9 samples (+0.7 %, clean); categories 81/81/100/36/83/100/66/65/—/50;
        test cases SEO-01 ✓, SEO-03 ✓, LNK-01 ✕, SEC-01 ✕, PRF-01 ✕, SEO-04 ✓ (38 cases · 12 passed · 5 failed).
MOTION:  letters 0.028 s apart, blur 12→0, y 60→0, rotationX −60→0, expo.out 0.5 s; camera power2.inOut 0.6–2.4 s;
        whip out 0.35 s power3.in with 18 px blur; morph 0.55 s power3.inOut; exits 40–50 % of entrances.
SHOTS:  hook 0–4.50 · kinetic 4.50–7.82 · devices 7.82–14.83 · scores 14.83–19.21 · memory 19.21–23.59 · plan 23.59–30.60 ·
        endcard 30.60–36.00 (all cuts on beats).
SOUND:  typing ticks, click on every real press, whoosh on whips/entrances (3 rotated takes), pops on landings, riser → impact
        on the logo landing. Peaks one frame after the action.
BANNED: flat screenshots as the hero; small UI in an empty void; three-card rows; titles drifting after landing; breathing loops;
        invented numbers; text under 26 px meant to be read.
QA:     t = 1.2, 3.3, 3.9, 6.0, 9.5, 12.5, 16.8, 21.8, 26.0, 29.0, 31.0, 34.5.
