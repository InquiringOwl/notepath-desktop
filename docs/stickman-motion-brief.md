# Stickman Motion Brief — instructions for ChatGPT (Astra)

Updated: October 11, 2026
Owner: Devon (Wolfie's Coven) · Project: NotePath · Feature: Note Office

You are animating a tiny cartoon character who lives in an office. Your job is to **add or improve motions (walk, sing, dance, and more) in his existing prototype** so they feel fluid, weighty, and full of personality. Read this whole file, then read `note-office-prototype/Stickman.md` and `note-office-prototype/index.html` before changing anything.

---

## 1. Files to have open

| File | Why |
| --- | --- |
| `docs/stickman-motion-brief.md` | This file: the rules, the rig, how motions are specified. |
| `docs/note-office-prototype/Stickman.md` | Design requirements, current routines, host message contract, change record. |
| `docs/note-office-prototype/index.html` | The complete working prototype (no build step, no dependencies). Work here. |
| A **motion card** (section 5) for each motion Devon asks for | The specific motion to make, with timing, key poses and references. |

New motion is developed and approved in the prototype `index.html`. Porting it into the app (`web/src/office.js`) is a separate step done afterwards; do not edit app files.

## 2. Non-negotiables

- **Motion quality is the top priority.** Treat him as a character, not poses sliding between coordinates. Prefer anticipation and follow-through over adding more effects.
- **Keep his look:** perfectly circular solid-filled head (radius 19.5), bold rounded limbs (base width 11.5), warm ivory background `#f5f2eb`, ink `#363932`, accent `#bb765b`. Do not change the palette, line weights or room unless the card says so.
- **Keep his attitude:** relaxed, playful, a little cocky, never stiff. Existing status lines show the voice ("Very busy doing nothing.", "Absolutely convinced he can sing.", "A stretch. He's earned it.").
- **Do not break what already works:** existing routines, the note/folder counting rules (`loose + carrying + filed === notes`), the `postMessage` contract, reduced-motion handling, and `destroy()` cleanup.
- **Stay self-contained:** one file, no new libraries, no network calls, no audio.
- **Never change Devon's approved timing or poses** for existing routines unless a card says so.

## 3. The rig (how a pose works)

All coordinates are in a fixed **800 × 480** logical scene; the canvas scales it. Y grows downward. The floor is about `y = 420`.

A **pose** is a plain object. Every routine is a function of time `t` (seconds since the routine began) that returns a pose:

| Key | Meaning |
| --- | --- |
| `hip`, `chest`, `head` | `[x, y]` of the three torso points. The head is drawn as a circle at `head`; a neck line joins chest and head. |
| `lh`, `rh` | Left/right **hand** targets `[x, y]`. |
| `lf`, `rf` | Left/right **foot** targets `[x, y]`. |
| `lk`, `rk` | Left/right **knee** positions (solved for you in walking via `joint`). |
| `face` | Facing: `-1` left, `0` toward the viewer, `1` right (fractions allowed, e.g. `.6` for a three-quarter turn while singing). |
| `tilt` | Body lean in radians (about ±.05 relaxed, ±.2 strong). |
| `chair` | Chair offset in px when he rises or sits. |

Limbs are two segments solved from the end target by `joint(a, b, l1, l2, side)` (two-bone IK). **Fixed bone lengths:** legs 61 + 62, arms 42 + 45. Never change them to make a pose reach; move the torso or the target instead.

Poses to start from: `seated()` (behind the desk, breathing) and `standing(x, y)`. Combine with `blend(a, b, t)`, `point(a, b, t)` and `mix`.

**Timing helpers (already in the file):**

- `smooth(t)` is a smootherstep ease. `ramp(t, a, b)` eases from 0 to 1 between times `a` and `b`.
- `pulse(t, a, b, c, d)` rises from `a` to `b`, holds, and falls from `c` to `d`. Use it as an envelope for any action.
- `soften(fn, t, boundaries)` blends 0.4 s across phase changes so nothing snaps.
- Entering a routine, the pose is blended from the previous one over 0.45 s.

**Registering a routine** (mirror an existing one such as `drum`):

1. Add its length to `duration`, its one-line caption to `words`.
2. Add its body to `actionPose(name, t)`, plus any props to `drawProps` and any arm overrides to `drawArms`.
3. Add it to the routine picker and, if it should happen on its own, to the `seq` list in `advance`.
4. If he leaves the desk, follow `walkingPose` / `tidyPose` (rise, travel, return, sit) and queue behaviour through `request` / `pending` so a routine is never cut off mid-trip.

## 4. What good motion looks like here

Apply these to every motion, in this order of importance:

1. **Weight.** The hips lead; the chest follows slightly later; the head lags the chest. Shift weight onto the planted foot before lifting the other. Small vertical bob (about 2 px) while walking.
2. **Contact.** A planted foot does not slide. A swing foot lifts (about 16 px) and lands. Hands touching a prop stay attached to it.
3. **Anticipation and follow-through.** Before a big action, a small opposite move (lean back before a throw, head dips before standing). After it, a settle (about 3 px bounce when sitting). See `rise` and `sit`.
4. **Offsets.** Offset the timing of body parts by 0.05–0.15 s (note the `-.3`, `-.7`, `-.8` phase offsets in `sing`). Nothing moves as one block.
5. **Easing.** No linear motion. Use `smooth`, `ramp` and `pulse`.
6. **Overlap and arcs.** Hands and feet travel in arcs, not straight lines.
7. **Holds.** A beat of stillness before and after an action reads as intention. Do not fill every second.
8. **Idle life.** Even at rest he breathes and shifts slightly.
9. **Loop and handoff.** Every routine starts from and ends in a pose the next one can blend from (normally seated). No pops.

## 5. Motion cards (how Devon specifies a motion)

A video alone is **not** enough, and you should not assume you can watch one. For each motion Devon provides a card with the intent, a beat sheet with times, key poses (stills or numbers), and, if useful, a reference video with timestamps and what to take from it. Video supplies timing, weight and feel; **never copy a reference's line style, characters or look.** If a card references a video you cannot view, work from the beats and stills and say so.

### Template

```
## Motion: <name>
- Intent: <what he is doing, why, and the attitude>
- Mood words: <3–5 words, e.g. loose, smug, bouncy>
- Duration: <seconds>   Loops: <yes/no>   Starts from: <pose>   Ends in: <pose>
- Where: <at desk / floor between cabinets / shelf side / anywhere>
- Props: <none / paper / music notes / ...>

### Beat sheet
| Time (s) | What happens | Notes (weight, anticipation, hold) |
| --- | --- | --- |
| 0.0–0.5 | ... | ... |

### Key poses (optional but best)
- Stills: <file names or screenshots, with the time each belongs to>
- Numbers: <pose objects in the rig's keys, e.g. t=1.2 → hip [400,301], chest [404,229], head [409,191], lf [388,420], rf [414,420], tilt .06>

### Reference (optional)
- Video: <link> at <mm:ss–mm:ss>
- Take from it: <timing / weight shift / arm swing / head bob>
- Do NOT take: <look, outfit, camera, background>

### Don'ts
- <e.g. no sliding feet, not floaty, don't speed up>
```

### Worked example (matches the existing prototype)

```
## Motion: Take a stroll
- Intent: a very important little stroll away from the desk and back, in no hurry.
- Mood words: unhurried, self-important, relaxed
- Duration: 18.5 s   Loops: no   Starts from: seated   Ends in: seated
- Where: left and right of the desk along the floor (x 249 ↔ 560)
- Props: none

| Time (s) | What happens | Notes |
| --- | --- | --- |
| 0–1.8 | Lean in, head dips, push up out of the chair | Anticipation first (head forward ~17 px, chest ~11 px), then rise; chair slides 9 px |
| 1.8–5.0 | Walk right to x 560 | Ease in and out of the gait; hip bob ~2 px; opposite arm swing |
| 5.0–6.4 | Pause, shrug, hands lift slightly, lean back | Hold before moving again |
| 6.4–11.7 | Long walk left to x 249 | Pass the desk, keep stride length consistent |
| 11.7–13.0 | Pause, face left, head turns a touch | Settle |
| 13.0–16.8 | Walk back to the desk (x 400) | Slow down on arrival |
| 16.8–18.0 | Turn, sit, small settle bounce (~3 px) | Hips land first, head last |

Don'ts: no foot sliding, no constant speed, no snapping between phases.
```

### Motions requested (fill these in; Devon adds one card per motion)

- [ ] Walk (improved gait, turns)
- [ ] Sing
- [ ] Dance
- [ ] (add more)

## 6. How to work

1. **Read first.** Summarise back to Devon in five lines or fewer what you understand the rig, the card and the constraints to be. Ask at most one question, and only if the card cannot be built without the answer.
2. **Change as little as possible.** Edit only the functions listed in section 3. Show the changes as clearly marked blocks (function name + new code), not a rewrite of the whole file, unless Devon asks.
3. **Check your own work before handing it back.** Sample the routine at 60 fps and confirm:
   - every coordinate is finite;
   - no joint jumps more than a few pixels between frames (except intended impacts);
   - limb lengths stay constant;
   - planted feet do not slide;
   - the first and last frame blend cleanly into the neighbouring poses;
   - nothing is drawn outside the 800 × 480 scene except intended props.
   Render a contact sheet (about 12 evenly spaced frames) if you can and look at it critically; fix what looks stiff, floaty or snapped.
4. **Report plainly.** After the change, list: what you built, what you deliberately left alone, what you could not verify, and one thing you would tune next. No marketing language.
5. **Record it.** Add a short entry to the change record in `Stickman.md` (behaviour change, validation done, known limits).

## 7. Feedback vocabulary (how Devon will react)

Use these to interpret feedback consistently:

- "floaty": too little weight. Add a hip-led settle, shorten airtime, plant feet.
- "stiff": body moves as one block. Add offsets between hips, chest and head; add idle life.
- "snappy": needs easing or anticipation. Replace linear moves with `ramp` / `pulse`.
- "rushed": lengthen holds and the beats around the main action.
- "too much": reduce amplitude by a third before changing anything else.

When Devon approves a motion, treat its timing and poses as fixed and do not alter them in later passes.
