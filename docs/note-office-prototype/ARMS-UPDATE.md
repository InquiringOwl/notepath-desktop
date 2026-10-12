# Note Office — connected, articulated arms

October 11, 2026 · prototype version 2.3

This revision supersedes the arm-rounding approach in ACTING-UPDATE.md and the earlier throw coordinates in MOTION-UPDATE.md. Continue from the accompanying index.html. The live NotePath application has not been changed.

## Reference observations

I inspected walking key poses and the opening greeting in [Tito Animate’s walking tutorial](https://www.youtube.com/watch?v=jZusA9pDgJk), and preparation/extension poses in [Rakuto’s punch tutorial](https://www.youtube.com/shorts/e1Q-aZhbgkA). The useful principles are low, relaxed walking arms; a distinct elbow hinge; an upper arm and forearm that move separately; and preparation, fast extension, and recovery that read as different actions. The office gestures are newly authored adaptations, not traced motion or a complete motion-capture reconstruction. The exaggerated punch distortion is not reproduced.

## Changes

- **Connected bones:** each arm is a single shoulder → elbow → hand path with rounded joins. The wide curve that cut across and visually obscured the elbow has been removed. Upper arm and forearm stay exactly 42 and 45 logical pixels long, including the stretch pose. Out-of-reach targets are constrained to the real reach.
- **One resolved pose:** `finishPose` now resolves the arms before drawing the figure or held props. The renderer and props share the same hand endpoints. Original hand goals are retained for interruption blends, avoiding a second articulation of an already resolved arm.
- **Walking:** upper-arm swing is ±0.43 radians (about ±25°). The forearm trails it by 0.30 radians of stride phase, with additional flexion. Measured internal elbow angle varies from about 145° to 175°, rather than keeping one rigid bend. Arms swing opposite the legs and blend into/out of the existing gait. The planted feet, leg lengths, travel easing, body movement, stops, and 18.5-second routine are preserved.
- **Paper plane:** bring the plane up, draw the hand back from x=445 to x=415, hold the cocked pose at 3.68–3.78 s, then unfold and drive forward. The throwing elbow remains below the shoulder. Internal elbow angle opens from about 15° cocked to 162° at release and 178° in follow-through. Release remains at 4.05 s, now at (499, 262). The glide starts at that exact hand position and matches its release velocity; the first flight curve is adjusted accordingly. Flight duration remains 5.3 s and speed decreases throughout.
- **Paper ball:** low catches and underhand scoops replace high shoulder-driven throws. Body-drive offsets are reduced to 22% of their previous strength. The receiving hand stays low; catch give remains. A hand-to-hand transfer at 6.95 s puts the ball in the right hand for the existing right-side desk drop. A lateral arm arc keeps the held ball above the desk during the grip change.
- **Ball trajectory adjustment:** low receiving hands require different arcs. Gravity changes from 1000 to 1600 logical px/s² while flight times stay 0.70, 0.56, and 0.66 s. The resulting rises are 98, 62.7, and 88.6 px. Launch speed still peaks at release, with exact hand/ball contact. The desk bounce retains its 45% height ratio and settles at x=489.
- **Wave and gestures:** the wave rotates its 45 px forearm ±0.20 radians around a nearly stationary elbow. Measured hand travel is 16.5 px while elbow travel is only 0.14 px over the waving interval. Singing retains its authored pauses and asymmetric poses, with a readable elbow hinge. Desk drumming, reading, and stretching use the same connected-bone rendering.

The enlarged 20.7675 px head radius, visible 5 px neck, character line weights, and routine durations remain unchanged.

## Porting order

1. Port `shoulder`, `articulateArms`, the additional pose fields, and the updated `finishPose`, `drawArms`, and `begin` together. Resolve arms only once, after transition blending and before props. Preserve `lGoal`/`rGoal` for interrupted-pose blending.
2. Port the walking arm phase/weight fields and forward-kinematic swing. Keep the existing foot-contact logic.
3. Port the ball tracks, low-pole blend, transfer, gravity, and reduced body drive as a unit.
4. Port the plane hand track and revised first flight curve together; otherwise the plane will detach at launch.
5. Port the waving forearm rotation and singing elbow blend.

Preserve the real application's count integration, themes, cached scene layers, and lifecycle/performance work described in Stickman-for-Astra.md. The standalone demo's simulated counts and controls should not replace application data flows.

## Verification

The actual inline animation code was executed offline with a Canvas renderer. All routines were sampled at 240 Hz; geometry, props, and state transitions were checked. Results are in arm-verification.json.

- Arm length error below 0.000000001 px; no disconnected endpoints.
- Throwing elbows stay below shoulders; plane reaches near-full extension.
- Release and catch position errors effectively zero; numerical release-velocity error below 0.1 px/s.
- Held ball stays above the desk, hand transfer has no gap, and bounce never passes through the surface.
- Walking has zero planted-foot slide; original leg lengths are unchanged.
- Wave pivots at the elbow; walking elbow angle changes by roughly 30°.
- Singing/drumming holds, greeting resume/defer behavior, paper conservation, and action queue checks pass. Interrupting singing during an arm transition produces no hand-position jump.

The preview GIF and contact sheets were rendered from this source and visually inspected. The GIF shows four separate clips at normal speed; panel loop boundaries are edits, not routine transitions. This pass does not claim fresh browser-layout or live-app integration testing. Refresh the existing prototype browser tab to load the saved source.

## Review files

- `arms-preview.gif`: moving comparison of walk, plane, ball, and wave.
- `arms-contact-sheet.png`: key throwing and gesture poses.
- `stride-contact-sheet.png`: eight samples of one complete stride, centered for comparison.
- `index.html?review=1`: choose a routine and scrub exact times.
