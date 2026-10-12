> Historical revision: arm mechanics and throw coordinates are superseded by [ARMS-UPDATE.md](ARMS-UPDATE.md) and the current index.html.

# Stickman proportions and motion update

October 11, 2026 · standalone prototype revision for review

**Proportion follow-up:** the current prototype now has a 5 px visible neck above the rounded torso cap. Head radius remains 20.7675 px. The earlier contact sheets and neck-removal measurements below document the previous revision.

Open `index.html?review=1` in a browser to select a routine and scrub its time. The normal `index.html` retains automatic playback and the existing host API. The review slider pauses at the selected time; Play resumes from there.

## Changes and measurements

| Area | Previous | Revised |
| --- | --- | --- |
| Head radius | 19.5 px | **20.7675 px**, exactly +6.5%; diameter 39 → 41.535 px |
| Neck | Separate line from chest to head | Removed; head overlaps the torso endpoint by 2 px to avoid a seam |
| Swing-foot lift | 16 px | **30.54 px peak**, approximately +91% |
| Arm swing | 24 px horizontal amplitude | **34 px**, +42%, opposite the advancing leg |
| Walk vertical rhythm | 2.1 px sinusoidal bob | 3.8 px support-phase rise, with reach correction and a 5 px softening of the knees during travel |
| Hip / chest | Little separation | 3.2 px lateral hip sway; counteracting chest movement and shoulder twist |
| First / last steps | Whole-route quintic easing; foot contacts also blended | 20% acceleration/deceleration windows, gentle speed variation, exact world-space foot anchors |
| Foot roll | Flat 10 px line | 5 px heel lift at toe-off; toes lift 4 px at heel contact, then settle flat |
| Ball flight | 2.28 s, sine-based lateral motion | Three parabolic throws: **0.70 / 0.56 / 0.66 s**, gravity **1,000 px/s²** |
| First toss height | Approximately 102 px, floaty | **96.17 px** above release, caught 62 px higher by the opposite hand |
| Catch | One hand | Right → left → right → left, each catch absorbs **8 px**; extra spin on the final toss |
| Desk bounce | Eased downward arc | 52 px fall; first rebound **45%** of drop height, second **11.25%**; **45 ms** squash contacts and a slowing roll to rest |
| Plane | 7 s multi-loop flight | **5.3 s** single broad turn; speed **249.54 → 33.3 px/s**, then a **0.65 s** friction skid |
| Plane orientation | Path tangent only | Tangent orientation plus subtle pitch wobble and visible wing banking |

The first ball toss catches higher to reconcile the requested short flight and approximately 100 px rise with 1,000 px/s² gravity. An equal-height toss at that gravity would need about 0.89 s to rise 100 px.

Crumpling now has four visible stages: squeeze, twist, flatten, squeeze. The sheet develops an irregular outline and creases as the hands close. Throwing uses a windup, hips leading the chest, a hand accelerating to its release velocity, and a moving follow-through. The head follows the props and the plane landing gets a small nod.

## Code to port

The readable implementation is inline in `index.html`.

- `HEAD_RADIUS`, `finishPose`, `drawBody`: head size, removal of neck, head contact with torso; singing hand follows the lowered head.
- `travel`, `gait`, `softenContact`, `drawLegs`, `drawArms`: contact-based walking, foot roll, shoulder twist, preserved joint solving. `walkingPose` and `tidyPose` retain their existing itinerary and timing; `actionPose` routes through the contact-preserving transition helper.
- `track`, `releaseKeys`, `throwBody`: time-based hand trajectories and release-matched velocity. The last 0.20 s accelerates the hand; the next 0.14 s continues its motion before settling.
- `crumpleAmount`, `drawCrumple`, `ballPose`, `ballMotion`, `tosses`, `drop`, `ball`: staged crumpling, alternating throws/catches, desk contacts, deformation and roll.
- `flightPoint`, `flight`, `planeMotion`, `planePose`, `plane`, `planeHandTrack`: decelerating glide, bank, launch contact, landing and skid. The arc-length table is built once; the plane and ball state buffers are reused.
- `drawProps`, `drawStored`, `draw`: new prop rendering and persistent resting poses. `seated` accepts an optional local time for repeatable ball/plane evaluation.
- Optional `review=1` controls expose `noteOffice.seek(name, seconds)` only in review mode.

## Preserved

- Stroll **18.5 s**, ball **9.4 s**, plane **12 s**; existing stroll stops and rise/sit beats.
- Walking leg segments **61 + 62 px** and arm solver **42 + 45 px**; limb thickness and solid round head.
- Room, furniture, themes/palette behavior, note/folder accounting, queued activities, pause and reduced-motion handling, silent operation and host message API.
- Real notes and folders are never modified by animation.

## Verification

Headless Chromium sampled all routines at 120 Hz for finite coordinates. Targeted checks passed for unchanged walking segment lengths, reachable arm targets, zero drift during flat planted-foot phases, release/catch position continuity, held-ball attachment, hand speed peaking at each ball release, and launch velocity agreement (numerical error under 0.03 px/s). Ball contact envelopes stay above the desk surface. Both prescribed and measured plane speed decrease throughout the glide. Paper conservation and queued actions also passed. Desktop, 360 px and 320 px layouts ran without script errors or horizontal overflow.

The contact sheets show one full stride, four crumple stages, windup/release/follow-through, an entire first toss/catch cycle, the first desk impact and rest, and plane launch/glide/turn/landing. The walking figure is centered in each panel to make the poses comparable; this intentionally removes world translation from the sheet, while the numerical contact check uses world coordinates.

## Limits and next tuning pass

This is a prototype handoff, **not an edit to the live app's `web/src/office.js`**. The real app's cached-room rendering, allocation/performance budget, live theme integration, 3,000-note load and dynamic room layouts were not tested. The prototype retains its original allocating pose architecture and room renderer; port the equations into the live app's existing buffers and cached drawing layers. The plane uses an authored, time-parametrized glide rather than an aerodynamic simulation. Its furniture clearance was visually reviewed in the supplied prototype arrangement; it is not a collision system for arbitrary live-app layouts.

Next, tune the depth and shape of the plane's descending turn in the real room: its outer-wall route keeps it clear of this prototype's furniture but gives the descent a pronounced nose-down phase.

## Review images

- `stride-contact-sheet.png` — complete left/right stride.
- `ball-contact-sheet.png` — crumple, throw, apex, catch, bounce and rest.
- `plane-contact-sheet.png` — windup through landing; orange rings identify the plane.

Machine-readable measurements are in `verification.json`.
