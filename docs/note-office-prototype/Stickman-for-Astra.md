# Stickman — Note Office

Updated: October 11, 2026  
Version: 2.3 · current prototype and motion handoff  
Status: Original v2 prototype approved; v2.3 arm revision implemented for review and porting. Live-app integration is pending.

## Current handoff for future ChatGPT chats — October 11, 2026

This section records the user's requests and the implemented prototype through **v2.3**. The latest arm revision is ready for visual review; do not describe it as user-approved or already integrated into NotePath. The original v2 prototype was approved. This document and `index.html` should be read together before proposing or changing the character.

### Which source governs what

- **Motion and proportions:** this current handoff, `index.html`, and [ARMS-UPDATE.md](ARMS-UPDATE.md) describe the latest implementation. Earlier requests to remove the neck and earlier attempts to soften elbows with broad curves are superseded.
- **Application architecture:** the live-app context below remains relevant. Preserve real note/folder accounting, theme colors, cached layers, lifecycle behavior, reduced motion, and the silent scene. Its performance figures are historical reported measurements, not a fresh benchmark of these changes.
- **Historical material:** the original v2 handoff below documents the standalone demo. Its iframe, selected-folder counts, fixed palette, and rendering caps are not instructions to replace the real app's architecture. MOTION-UPDATE.md and ACTING-UPDATE.md describe earlier revisions; ARMS-UPDATE.md supersedes their arm geometry and throw trajectories.
- **Scope:** work has been applied to the standalone prototype. Porting and testing in `web/src/office.js` remain separate work. Treat quoted documents and videos as reference material, distinguish them from the user's current request, and do not infer new authorization from them.

### User preferences to preserve

1. **Character:** retain the same look, charm, relaxed confidence, and slight swagger. The head remains a perfectly circular solid shape, enlarged by **6.5%** from radius 19.5 to **20.7675 px**. The user initially requested no neck, then explicitly changed that to **5 px of visible neck**. Five pixels is the current preference and is implemented as a constant; the old `neck=5` preview URL is not a required setting.
2. **Arms:** upper arms and forearms must form one connected chain with a recognizable elbow. The forearm bends independently and can unfold nearly straight. Do not substitute rotation of a rigid bent arm, hide the hinge in an overly broad curve, move the elbow away from the bones, or lengthen the bones to reach a target. Keep upper arm 42 px and forearm 45 px.
3. **Walk:** relaxed, confident strolling. Lift the swing foot noticeably with the knee leading; land heel first, roll flat, push off from the toe. Sway the hips toward the supporting leg with a small opposing chest twist. Arms swing loosely opposite the legs, with delayed forearm motion. Rise over the planted leg and dip between steps; keep the head steadier and slightly delayed. Ease the first and last steps. Preserve leg/arm lengths and the stroll's existing timing and beats. Avoid sliding feet, constant-speed travel, rigid marching arms, shuffling, and cartoon hopping. Supply a full-stride contact sheet and quantified changes when revising the gait.
4. **Plane throw:** upper arm angled low, elbow below the shoulder. Cock the hand/plane back, then drive forward by opening the elbow and straightening the arm. The plane stays attached to the hand until release and continues from the hand's actual position and velocity.
5. **Ball toss:** a hand-led underhand scoop, with low elbows angled toward the body. Avoid shrugging or throwing from elevated shoulders. Catch into the hand, allow a small give, and keep the held ball clear of the desk. Preserve readable crumpling, flight, bounce, and settle. The user explicitly included all attached ball, throw, plane, and catch changes in the work.
6. **Acting:** use readable asymmetric poses, anticipation, deliberate holds, action, follow-through, and recovery. The upper arm leads and the forearm follows. Waving should visibly pivot at the elbow. Singing and desk drumming need phrasing and pauses rather than continuous unrelated oscillation. Preserve head-led attention and safe greeting/resume behavior.

These are user preferences. The numerical animation choices below are the current implementation, not immutable user requirements; refine them when the user's visual feedback calls for it.

### Video references and their purpose

| Reference | What to learn from it |
| --- | --- |
| [Original StickNodes style reference — STRENGTH VS SPEED](https://www.youtube.com/watch?v=cDoo53YgQhY) | Earlier visual direction: bold rounded line weight, solid head, character attitude. |
| [Alan Becker — Note Block Concert](https://www.youtube.com/watch?v=w0bYgvYokFM) | Expressive head/arm acting, asymmetric gestures, readable silhouettes, pauses and reactions. Informed the singing, drumming, and greeting pass. |
| [Tito Animate — Walking Tutorial](https://www.youtube.com/watch?v=jZusA9pDgJk) | Low relaxed walking arms, connected joints, changing elbow bend, and the opening greeting/gesture. This was supplied when the user rejected stiff, disjointed arms. |
| [Rakuto — How to animate a Stick Fight Punch](https://www.youtube.com/shorts/e1Q-aZhbgkA) | Clear preparation, bent-to-extended arm action, and follow-through. Adapt the mechanics to gentle office gestures; the user did not request fighting, punch effects, or exaggerated body distortion. |

Selected passages/key poses were inspected in the earlier work. These are qualitative references, not full motion capture or frame-for-frame reconstructions. No video assets are bundled. If a later chat needs new frame-specific conclusions, it should inspect the relevant passage rather than claim knowledge from these notes alone.

### What is implemented now

- `finishPose`, `shoulder`, `articulateArms`, and `drawArms` resolve and draw one connected chain. Arms use straight segments meeting at a rounded elbow. Held props use the resolved hands. `lGoal`/`rGoal` retain the unsolved targets for transition blending; do not solve an already resolved arm again.
- Walking uses upper-arm swing of ±0.43 radians (about 25°) and a forearm lag of 0.30 radians of stride phase. Internal elbow angle varies approximately **145–175°**. The gait retains its foot contacts, lift, sway, easing, and **18.5 s** duration.
- The plane hand draws back from x=445 to x=415, holds at **3.68–3.78 s**, and releases at **4.05 s** from **(499, 262)**. Elbow angle progresses approximately **15° → 162° at release → 178° in follow-through**. The first flight curve matches the new release; the glide remains **5.3 s**, within the **12 s** routine.
- Ball catches are low, and body-drive offsets are reduced to **22%** of the prior strength. Flights remain **0.70, 0.56, and 0.66 s**; gravity is now **1600 px/s²**, producing rises of **98, 62.7, and 88.6 px**. A **6.95 s** hand transfer precedes the desk drop; bounce height ratio is **45%**, with final rest at x=489. The routine remains **9.4 s**.
- The wave rotates the forearm **±0.20 radians** around a quiet elbow. Measured hand travel is **16.5 px**, versus **0.14 px** at the elbow. Authored singing/drumming holds and the notice → wave → resume behavior are retained. Greeting waits during prop handling and trips.

Port the pose finalization and rendering together, then the gait fields, then each throw's hand track and trajectory as a unit. Preserve the live app's caching and allocation constraints when adapting this prototype's procedural code.

### Evidence, preview, and remaining work

See [ARMS-UPDATE.md](ARMS-UPDATE.md) for detailed porting steps and [arm-verification.json](arm-verification.json) for current results. Offline execution of the actual animation code sampled every routine at 240 Hz: segment lengths, low throwing elbows, near-full extension, release/catch continuity, held-ball clearance, foot contacts, queued actions, paper conservation, and greeting transitions passed. These are geometric/state checks, not proof that the user considers the motion finished.

- [Moving preview](arms-preview.gif): four normal-speed clips. Panel loop cuts are preview edits.
- [Throwing and gesture contact sheet](arms-contact-sheet.png).
- [One full stride](stride-contact-sheet.png).
- Open `index.html?review=1`, choose a routine, and scrub its timing. Refresh an already open tab after source edits.

The live app still needs porting, visual review, and integration/performance checks. Fresh browser-layout testing was not performed for v2.3. Future chats should review full motion, including transitions, rather than judging only still poses. Update this document and the source handoff comment whenever preferences or implementation change.

---

## Read this first, Astra: current state in NotePath (added Oct 11, 2026)

The following section records the reported live NotePath architecture as of October 11, 2026. It governs application integration; the current v2.3 handoff above governs revised motion and proportions. The original v2 material below is historical standalone-demo context. The real app does not use the prototype (`index.html`) directly.

### What changed since the prototype

- **It is now built into the real app (NotePath, an Electron desktop notes app).** The scene is a `<canvas>` in the app's own code (`web/src/office.js`), not an iframe, and there is no `postMessage` bridge. The "Embed in the application", "Message contract" and "Same-document API" sections below no longer apply. It reads the real note and folder stores directly.
- **Paper accounting is different.** It is no longer driven by the selected folder's count, and the "up to 90 sheets / 14 boxes" caps are gone:
  - **Every note is exactly one sheet of paper.**
  - Unfiled notes: the first 75 (by creation) lie on the furniture (two desk piles and the two filing-cabinet tops; each sheet keeps its place). From the 76th on, they go in floor stacks of up to 100 each.
  - **Every folder is one open box** on the left or right of the room, with one upright sheet per note. Subfolders sit with their parent. Boxes stack along the side walls, then move to the front of the floor.
  - The room widens (zooms out) when things no longer fit, instead of overlapping.
- **The room takes the window's shape.** It is 800 × 480 at its core, fills the window with no letterboxing, and is at least 1040 wide.
- **Colours follow the app's theme** (12 themes plus custom colours), not the fixed ivory palette. The room, desk, paper and figure all repaint when the theme changes. Any new art has to take its colours from the theme, not hard-coded hex values.
- **Catch-up on open.** Since the last visit: new notes flutter down onto the desk, new folders drop in, notes filed into a folder are carried to their box (up to 3 trips), and deleted notes are crumpled into the bin. Then the greeting (surprise, wave), then his routines: sing, stroll, desk beat, read, paper plane, stretch, paper ball.
- **Interaction.** Click a sheet to open that note; click a box to open that folder; click him and he waves. Hovering shows the note title. The header shows his mood, the counts and a Pause button.
- **Reduce motion** in the app's settings gives a still office.

### Rules from Devon that any upgrade must keep

1. His poses, routines and timing come from the Stickman v2 prototype. **Keep the charm and attitude.** Improvements should be to motion quality (anticipation, weight, follow-through, contact, starts, stops, turns, sitting), not a different character.
2. **Performance budget.** The room and every sheet are painted once into two cached bitmaps (one behind him, one for the front floor strip) and repainted only when notes, folders, theme or size change. A frame costs about 0.3 ms of drawing and holds 60 fps with 3,000 notes; it runs at about 30 fps when idle, and nothing runs while the window is closed. Please don't propose anything that redraws the whole room every frame or allocates per frame.
3. **No backdrop blur, and no per-frame effects on the page behind it.** A blurred page under an animating canvas cost about 70 ms a frame.
4. Filing and animation are visual only. They never edit, move or delete real notes.
5. Silent. No audio.

### How to hand back upgrades

Astra, the real code (`office.js`) is not included in this package, and it is tied to the app's stores, so please don't try to rebuild it. Work in `index.html` as before and send back:

- the changed poses, routines, easing and timing as readable code (name the functions you changed, using the names in "How the animation is organized" below), and
- a short list of what you changed and why, so Claude can port it into `office.js` and run the app's checks.

Keep the sections below as the reference for the prototype itself.

---

## Historical standalone v2 handoff

The following sections describe the original demo and its integration options. For current motion, use the v2.3 handoff above; for the real app, use the live-app context immediately above.

## Start here

This package contains the current working Note Office animation for embedding in a note-taking application's browser box. Continue from `index.html`; it contains the complete editable markup, styles, animation logic, and integration bridge. No build step or dependencies are required.

Open `index.html` in a browser to try the demo. The buttons add simulated notes and folders, and the activity selector previews the routines. These controls do not create or change real application data.

The application itself was not available during development. The scene is ready to receive counts, but its connection to the real note store has not been implemented.

## The user's direction

The highest priority is **fluid, believable, engaging movement with personality**. Treat this as a tiny cartoon character living in an office, rather than a set of poses moving mechanically between coordinates.

Preserve these requirements:

- A warm Claude-style ivory background and a simple line-drawn office.
- A stick figure with a perfectly circular, solid-filled head. He normally sits behind the desk, facing the viewer.
- Bold, rounded limbs inspired by the line weight in the user's reference: [STRENGTH VS SPEED | StickNodes](https://www.youtube.com/watch?v=cDoo53YgQhY). The reference informed proportions and line weight; no video assets are included or required.
- A heavier outline for the desk than in the original prototype.
- Filing cabinets and one or two shelves. The earlier window, sun, and sunbeam were intentionally removed.
- Notes represented by thin sheets of paper. The paper count is driven by notes in the **currently selected folder** of the note application.
- Folders represented by outline boxes that stack in the room.
- A relaxed, playful character with attitude in his body language.
- A delayed reaction when the office opens: notice the viewer, look surprised, wave, then return to normal activity.
- Standing, walking, picking up papers, carrying them, putting them on a shelf or in a box, returning, and sitting down.
- Occasional singing shown by music notes drifting from his mouth area while his body grooves. Actual audio was not requested and is not implemented.

The user called version 2 a good prototype. Preserve its general direction while improving motion quality and integrating it into the actual application.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Self-contained working animation and editable source. |
| `Stickman.md` | This combined README, change record, and agent handoff. |
| `README.md` | Short entry point directing readers to this document. |

The package contains no remote dependencies, API keys, proprietary application data, or machine-specific runtime requirements. Optional ChatGPT state and design-control hooks are guarded, so the page also runs independently.

## Current appearance

| Setting | Current value |
| --- | --- |
| Logical scene size | 800 × 480 |
| Background | `#f5f2eb` |
| Character ink | `#363932` |
| Paper | `#fcfaf4` |
| Accent / music notes | `#bb765b` |
| Base limb width | 11.5 logical pixels |
| Desk line width | 3.5 logical pixels |
| Head | Current: filled circle, radius 20.7675 logical pixels; 5 px visible neck (supersedes original 19.5 px) |

The torso and arms use small width multipliers around the base limb width. Line weights scale with the scene. The scene intentionally uses a fixed light palette. The interactive demo adds a title, counts, activity selector, and controls; embedded mode hides that surrounding interface.

## Implemented routines

| Routine | Current behavior |
| --- | --- |
| Idle | Breathing, gentle posture changes, and subtle pointer-directed attention. |
| Greeting | About 2.2 seconds before surprise, followed by a wave. |
| Desk beat | Alternating hand taps, head movement, body sway, and foot movement. |
| Read a paper | Reach toward the desk stack, raise a paper, read, and return it. |
| Paper ball | Crumple a prop sheet, toss and bounce it, then leave a small ball on the desk. |
| Paper plane | Fold a prop, wind up, throw, follow its path, and leave it on the floor. |
| Sing & groove | Shoulder sway, head movement, foot taps, a small singing mouth, and drifting musical notes. Silent. |
| Take a stroll | Rise, walk to either side of the desk, pause, return, and sit. |
| Put papers away | Pick up a batch, stand, carry it, deposit it on a shelf or in a box, return, and sit. |
| A big stretch | Lift both arms, lean, extend the legs, and settle back. |

Requests made during walking or filing are queued until the current trip finishes, avoiding an instant jump back to the desk. This means a selected routine may take several seconds to start.

## Paper accounting

The demo starts with **24 notes and 4 folders**. Embedded mode starts with zero until the host provides real data.

- When at least 16 notes remain loose, the character prioritizes a filing trip.
- Each trip carries up to six papers.
- Trips alternate between a shelf and a box; when there are no folder boxes, the shelf is used.
- Filing changes the visual organization only. It never edits, moves, archives, or deletes real notes.
- The state maintains `loose + carrying + filed === notes`.
- Changing `folderId` resets visual filing progress for the newly selected folder. A per-folder history of that organization is not currently retained.
- Reading, crumpling, and paper-plane sheets are animation props and do not change the source count.

For bounded rendering, the scene individually draws up to 90 loose sheets and 14 folder boxes. Larger counts remain accurate internally and in the demo counter; additional objects are visually compressed into the existing piles. Bulk arrivals animate at most 10 papers and 5 boxes at a time. Every real application total should still be sent, without truncation.

## Embed in the application

Serve `index.html` at a URL your application can load. For example:

```html
<iframe
  id="note-office"
  title="Note Office animated room"
  src="/note-office/index.html?embed=1&parentOrigin=https%3A%2F%2Fyour-app.example"
  style="display:block;width:100%;aspect-ratio:800/480;border:0;border-radius:14px"
></iframe>
```

Replace `https://your-app.example` with the actual parent application's origin, URL-encoded. An origin consists of scheme, hostname, and optional port; it has no path or trailing slash. `embed=1` hides the demo controls, title, and counter.

The bridge accepts messages only from the parent window and the expected origin. Without `parentOrigin`, it uses the referring page's origin, falling back to its own origin. If using a WebView with an opaque origin or a restrictive iframe sandbox, adapt and test the messaging bridge for that environment rather than assuming standard browser origin behavior.

### Parent-side connection

```js
const frame = document.getElementById('note-office');
const officeOrigin = new URL(frame.src, location.href).origin;

function sendOffice(type, values = {}) {
  frame.contentWindow.postMessage(
    { source: 'note-office', type, ...values },
    officeOrigin
  );
}

function syncOffice() {
  sendOffice('set-state', {
    notes: getSelectedFolderNoteCount(),
    folders: getFolderCount(),
    folderId: String(getSelectedFolderId())
  });
}

// Attach the load listener when mounting the iframe.
frame.addEventListener('load', syncOffice);

// Also call syncOffice() after a note/folder mutation or folder selection change.
// Connect these calls to the existing application's store or event system.

function onOfficePanelOpened() {
  syncOffice();
  sendOffice('open');
  // If the panel was explicitly paused on close, resume according to the
  // application's motion preferences rather than overriding reduced motion.
}

function onOfficePanelClosed() {
  sendOffice('set-playing', { playing: false });
}

// Example explicit user opt-in to resume animation:
function onUserEnablesAnimation() {
  sendOffice('set-playing', { playing: true });
}
```

The `get...()` functions are placeholders for the target application's store. Choose the intended scope for `folders` in that application; it is the total number of boxes to represent. `notes` specifically refers to the selected folder's note count.

Use authoritative `set-state` snapshots as the default synchronization strategy. They are safe to repeat and handle additions, deletions, imports, and switching folders. Avoid applying an increment for an event already reflected in a snapshot.

### Message contract

All messages require `source: 'note-office'`.

| `type` | Other fields | Effect |
| --- | --- | --- |
| `set-state` | `notes`, `folders`, optional `folderId` | Synchronize totals and selected folder. |
| `note-created` | None | Increment the represented note count. |
| `folder-created` | None | Increment the represented folder count. |
| `open` | None | Schedule the greeting; finish an ongoing trip first. |
| `set-playing` | `playing: boolean` | Pause or resume animation. |

Counts must be integers between 0 and 1,000,000. Invalid values and unexpected message origins are ignored. `folderId` is a string, stored up to 200 characters.

### Same-document API

When mounting the source directly rather than in an iframe:

```js
const office = document.getElementById('note-office-room').noteOffice;
office.setState(24, 4, 'folder-id');
office.addNote();
office.addFolder();
office.open();
const state = office.getState();
office.destroy(); // Remove listeners, observers, and the animation loop.
```

`getState()` returns `notes`, `folders`, `folderId`, `filed`, `loose`, `carrying`, `activity`, `queued`, and `playing`. There is one fixed root ID; refactor instance scoping before mounting multiple copies in one document.

## How the animation is organized

Everything is in the inline script in `index.html`:

| Area | Useful function / value names |
| --- | --- |
| Look and palette | `config`, `C`, root-scoped CSS variables |
| Timing and transitions | `duration`, `begin`, `request`, `advance`, `soften` |
| Body poses | `seated`, `standing`, `rise`, `sit`, `actionPose` |
| Walking and filing | `gait`, `travel`, `walkingPose`, `tidyPose` |
| Joint geometry | `joint`, `limb`, `shoulder`, `articulateArms`, `finishPose`, `drawLegs`, `drawArms` |
| Room and furniture | `drawRoom`, `drawCabinet`, `drawChair`, `drawDesk` |
| Papers and boxes | `setCounts`, `loose`, `carried`, `drawStored`, `drawArrivals` |
| Props and effects | `drawProps`, `paper`, `stack`, `ball`, `plane`, `flight`, `musicalNote` |
| Host connection | The `message` listener and `root.noteOffice` |
| Rendering lifecycle | `draw`, `resize`, `frame`, observers, abort controller |

The motion combines eased pose targets, anchored stance feet, lifted swing feet, two-segment limb solving, curved joints, anticipation, and body follow-through. It is procedural animation, not a full physics simulation or an authored skeletal animation asset.

## Change record

### Version 2 — accepted prototype

- Increased character line weight substantially and used rounded limbs.
- Increased desk line weight.
- Removed the window, sun, and sunbeam.
- Added two filing cabinets and two shelves.
- Reworked movement around weight shifts, foot contact, coordinated joints, and smoother transitions.
- Added walking, filing, singing/grooving, and stretching.
- Added selected-folder identity to the host connection.
- Added visual paper accounting while preserving real note totals.
- Queued routine changes during walking and filing.
- Updated responsive layout, reduced-motion handling, and lifecycle cleanup.

### Version 1 — initial prototype

- Established the warm room, desk, chair, solid-headed stick figure, note piles, and folder boxes.
- Added greeting, desk beat, reading, paper ball, and paper plane routines.
- Added demo controls and an initial embedding bridge.

## Validation already performed

- Opened the final standalone and in-chat previews without JavaScript errors.
- Checked desktop, 360px, and 320px layouts; the smallest layout had no horizontal overflow.
- Exercised note and folder creation controls.
- Sampled all routines at 60 simulated frames per second for finite coordinates and large pose discontinuities.
- Checked conservation of note counts during filing.
- Checked queued transitions and folder changes.
- Checked message origin validation and invalid-count rejection.

These checks establish that the prototype runs and maintains its counts. They do not replace animation review or integration testing in the target application. The development test harness used local runtime paths and is intentionally excluded from this portable package.

## Priorities for the next agent

1. **Preserve and improve motion quality.** Review entire loops in motion, especially starts, stops, turns, hand-to-paper contact, carrying, depositing, and sitting. Refine remaining mechanical or floaty moments. Prefer purposeful anticipation and follow-through over adding more unrelated effects.
2. **Integrate with the real note store.** Connect the selected folder's note count, the intended folder count, stable folder IDs, and panel visibility. Test rapid updates, deleting notes during a trip, and switching folders mid-routine.
3. **Fit the actual browser box.** Verify its dimensions, origin/sandbox behavior, background, device scaling, and reduced-motion preference handling.
4. **Decide how large folders should look.** Current visual caps prevent excessive rendering. If exact individual object counts are required, implement an appropriate pile or storage representation instead of silently dropping source counts.
5. **Harden lifecycle and persistence for the host.** The optional ChatGPT state hooks do not provide standalone persistence. Decide whether filing progress should persist per folder and how it should reset. Test mount/unmount, backgrounding, and multiple instances if needed.

Keep this document updated alongside the implementation. Record behavior changes, integration decisions, validation performed, and remaining limitations here so the next handoff does not depend on the original chat.
