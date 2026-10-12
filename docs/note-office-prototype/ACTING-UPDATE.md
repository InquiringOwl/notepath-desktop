> Historical revision: arm mechanics and throw coordinates are superseded by [ARMS-UPDATE.md](ARMS-UPDATE.md) and the current index.html.

# Note Office — expressive gestures

October 11, 2026 · prototype version 2.2

This pass adapts ideas from the inspected passages of [Alan Becker's Note Block Concert](https://www.youtube.com/watch?v=w0bYgvYokFM): asymmetric silhouettes, curved arms, and pauses that separate an action from its reaction. These are newly authored office gestures, not a frame-for-frame reconstruction.

## What changed

- **Softer arms:** the elbow rounding now spans more of the arm (rounding parameter 0.80 → 0.53 generally, 0.43 for performance/greeting poses). The shoulder-to-elbow and elbow-to-hand solver remains 42 + 45 px. Wave and singing no longer move the solved elbow to an arbitrary override. The existing stretch override is preserved.
- **Head and shoulder acting:** authored head angles are expressed by changing the head's position relative to the shoulders. Singing/drumming use an 80 ms head delay; the initial notice has no delay, so attention leads the shoulder reaction. Small shoulder rolls separate the arms' poses.
- **Singing:** restrained groove, a listening pause, preparation, one-arm flourish, quieter recovery, a second phrase, and a pleased finish. Holds occur at 2.12–2.55 s, 3.78–4.12 s, 5.22–5.58 s and 8.05–8.43 s. Musical-note and mouth effects are gated to the singing phrases. The hands hold their exact positions during the pauses; only very small breathing remains.
- **Desk drumming:** 12 authored taps grouped into phrases, including a two-hand flourish. Each tap has a lift, a fast 65 ms downward stroke and a small rebound. Quiet holds at 2.20–2.65 s and 5.18–5.68 s replace nonstop alternating motion. Contact marks follow the actual tap schedule.
- **Greeting:** notice, a short suspended-hand pause, a restrained wave, and a settle. Clicking the figure or Say hello during singing/drumming saves the routine time and resumes there after the wave, with a 450 ms visual transition. Greeting requests during reading, ball/plane play or a trip wait until the current routine finishes.
- **Reading:** lean closer, briefly pull back to reconsider, then adjust the paper 4 px sideways and 2 px upward. The prop receives the same adjustment as the hands.
- **Plane landing reaction:** after landing, a small forward/downward nod replaces a mostly invisible vertical head target adjustment.
- **Review controls:** Notice the viewer and Wave hello are now selectable alongside the existing activities.

## Preserved

The head radius is **20.7675 px**, with **5 px of visible neck**. Limb weights, joint lengths, walking contact model, throw/catch trajectories and routine durations are unchanged. Singing remains 10 s, drumming 7 s, notice 0.85 s and wave 3.4 s. The scene remains silent. Note accounting and the host message API are unchanged.

## Functions and data to port

- `singKeys`, `drumKeys`, `noticeKeys`, `waveKeys`, `drumHits`: reusable authored timing/pose tables, allocated once.
- `actingChannel`, `actingPose`, `singingPose`, `singVoice`, `drummingPose`, `tapLift`, `greetingPose`: deterministic local-time evaluation.
- `limb`, `drawArms`, `finishPose`: rounded arm rendering and unchanged head/neck constraints.
- `greet`, `resumeActivity`, `begin`, `request`, `open`, `advance`, `draw`: safe interruption and an independent transition clock.
- `actionPose`, `planePose`, `drawProps`: reading/landing acting and synchronized effect timing.
- Figure click, Say hello and review selection handlers.

## Validation and limits

Chromium checks sampled all routines at 120 Hz, with additional checks for the newly authored poses. All coordinates were finite; arm targets remained within the 87 px reach; walking leg lengths and fixed contacts were preserved. Existing release/catch continuity, ball/desk contact, decreasing plane speed, paper conservation and queued-action checks passed.

New checks confirmed exactly stationary hands during a singing and a drumming hold, no singing effect during the listening hold, surprise → wave → resumed singing at the saved 1.5 s position, and deferred greeting during plane flight. Desktop, 360 px and 320 px layouts completed without browser errors or horizontal overflow. The contact sheet was visually inspected.

This changes the standalone prototype only. Live-app `office.js` integration, cached rendering, theme integration and load performance still require verification in NotePath. The current prototype keeps its existing pose-allocation architecture; the new keyframe tables themselves are created once.

Review `acting-contact-sheet.png` for the key poses. Open `index.html?review=1` to choose a routine, scrub it, or press Play. `acting-verification.json` contains the numerical results.
