# Stickman — Note Office

Updated: October 11, 2026  
Version: 2.3 · articulated arm revision for review  
Status: Version 2 was user-approved; this proportions and motion revision is ready for review and porting.

## Current revision — October 11, 2026

The real app now has its own implementation in `web/src/office.js`; see `Stickman-for-Astra.md` for that context. This file documents the standalone prototype. The revised prototype is not yet ported into the real app.

The latest arm fixes, measurements, checks, and porting notes are in [ARMS-UPDATE.md](ARMS-UPDATE.md). Preview `arms-preview.gif`, `arms-contact-sheet.png`, and the updated `stride-contact-sheet.png`. The older ACTING-UPDATE.md remains a record of the earlier personality changes; its arm-rounding description is superseded.

See [MOTION-UPDATE.md](MOTION-UPDATE.md) for measurements, changed function names, checks and limitations. Open `index.html?review=1` to scrub the animation. Contact sheets are included beside the prototype.

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
| Head | Filled circle, radius 20.7675 logical pixels; 5 px visible neck |

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
| Joint geometry | `joint`, `limb`, `drawLegs`, `drawArms` |
| Room and furniture | `drawRoom`, `drawCabinet`, `drawChair`, `drawDesk` |
| Papers and boxes | `setCounts`, `loose`, `carried`, `drawStored`, `drawArrivals` |
| Props and effects | `drawProps`, `paper`, `stack`, `ball`, `plane`, `flight`, `musicalNote` |
| Host connection | The `message` listener and `root.noteOffice` |
| Rendering lifecycle | `draw`, `resize`, `frame`, observers, abort controller |

The motion combines eased pose targets, anchored stance feet, lifted swing feet, two-segment limb solving, curved joints, anticipation, and body follow-through. It is procedural animation, not a full physics simulation or an authored skeletal animation asset.

## Change record

### Version 2.2 — expressive gestures

- Softened arm curves and added asymmetric singing phrases, synchronized drumming patterns, and deliberate pauses.
- Added readable head/shoulder attention, a notice-and-wave greeting, and resumption of interrupted singing/drumming.
- Added reading reconsideration/paper adjustment and a clearer plane-landing nod.
- Preserved the 5 px neck, enlarged head, joint lengths, routine durations and prop physics.
- New pause/interruption checks and prior motion regressions passed; key poses visually reviewed. Live-app porting remains pending. See [ACTING-UPDATE.md](ACTING-UPDATE.md).

### Proportion follow-up — 5 px neck

- Added 5 logical pixels of visible neck above the rounded torso cap, keeping the enlarged head radius at 20.7675 px. Previous motion contact sheets show the earlier neckless version.

### Version 2.1 — proportions and motion review

- Removed the neck and increased head radius by exactly 6.5% (19.5 → 20.7675 px).
- Replaced the walking travel model with fixed foot contacts, 30.54 px foot lift, heel/toe roll, counter-sway and 34 px opposite arm swing; preserved the stroll itinerary and duration.
- Added four crumple stages, three alternating ballistic tosses/catches, release-matched hand velocity, 8 px catch absorption, desk bounces and a friction roll.
- Replaced the plane's looping path with a 5.3 s decelerating glide, bank, landing and skid; preserved the 12 s routine.
- Added opt-in review scrubbing and stride/ball/plane contact sheets. Numerical and browser checks passed; live app integration, caching and load performance remain unverified.
- Full details and next tuning target: [MOTION-UPDATE.md](MOTION-UPDATE.md).

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
