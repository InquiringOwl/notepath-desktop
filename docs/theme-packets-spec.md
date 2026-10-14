# NotePath Theme Packets: Specification (draft 1)

Oct 13, 2026 · @Jamie

## Purpose and principles

A theme packet is a downloadable bundle of colours, artwork and optional gentle motion that restyles NotePath without adding any code to the app. Packets are optional downloads, like DLC, so the installer stays small and only people who want a theme pay its disk cost.

Every later section follows these rules:

- **Small installer.** The installer ships only the four minimal presets (Paper, Sepia, Graphite, Midnight) and High Contrast. Everything else is downloaded on demand and stored outside the app.
- **Themes are data, not programs.** A packet holds a manifest and image files. NotePath's own scene engine draws it. A packet can never run JavaScript.
- **Performance mode wins.** A scene follows the Performance setting: Lite shows a still image, Moderate shows cheap motion, Full shows the richest version. Motion uses only transform and opacity.
- **Motion stays out of the way.** Animation lives on the Main Menu and page margins, never behind the editor, and it pauses when the window is hidden, a dialog is open, or reduce motion is on.
- **Accessibility is never paid.** Plain themes and High Contrast are always free. Paid packs may add scenes, not readability.
- **Original art only.** No brand logos or known characters, so packs carry no licence risk. This is a design rule, not legal advice.
- **Offline after install.** Once a pack is installed it works with no network. Removing it frees its space.

## Decisions, Oct 14, 2026 (Devon)

These override anything below that disagrees; the sections below are amended to match.

- **Built into the installer, always free:** four minimal colour presets, **Paper** (light), **Sepia** (warm light), **Graphite** (dark) and **Midnight** (navy dark), plus **High Contrast**. They are authored as packs (same manifest, validated by `tools/theme-check.js`) but ship inside the app, cannot be removed, and must be treated as the **Bundled** licence class by any monetization framework: they never become paid.
- **Your colours** (the existing picker with three save slots) moves to the main Appearance page beside the four presets and starts from the preset in use.
- **Plain style:** the minimal presets get a plain look (flat panels, no corner ticks, no glow, normal-case labels), like a typical document or note app. The console look (glass gradient windows, corner ticks, glows, uppercase labels) belongs to the console themes.
- **Holographic pack:** today's console themes (Deep Space, Obsidian, Old Growth, Moss & Lichen, Abyssal, Tidepool, Ember, Canyon Clay, Morning Mist, Lavender Dusk, Frosted Glass, Aurora Glass) become one collection, **Holographic**, on its own **Themes ›** page under Appearance. It is a **paid download**. Every install that existed before the update keeps it free (grandfathered) and has it installed automatically, so no one loses their look.
- **Default for new installs:** follow the system: Paper in light mode, Graphite in dark mode, switching with the OS.
- **Order:** Phase 1 builds the restructured Appearance, the four presets, the plain style and the pack foundation, with Holographic still built in on the Themes page. Phase 2 turns Holographic into a real download (with the grandfather install). Phase 4 adds its licence.
- **Removed pack fallback:** the previous built-in theme, else the system default above.

## Phase 1 as built (Oct 14, 2026)

What Phase 1 settled while building; these also override the sections below.

- **The four presets are real packs** in `web/themes/<id>/manifest.json`, checked by the same rules and built into the page. A built-in pack needs no `preview` or signature.
- **Two optional manifest fields:** `style` (`plain`, the default, or `console` for the Holographic look) and `description` (up to 120 characters, shown on the card).
- **`faint` must reach 4.5:1**, not 3:1. NotePath uses it for small hints and counts, and the accessibility check needs 4.5:1 there.
- **SVGs with anything active are refused, not stripped:** scripts, event handlers, outside links, embedded documents or images, entities, stylesheets. Refusing is simpler and safer, and authors see why in `theme:check`.
- **Signing:** `theme-key.json` holds the public key. It stays `null` until Devon runs `npm run theme:keygen` on his Mac, and until then no downloaded pack installs. `npm run theme:pack` signs with the private key in `~/.notepath/theme-signing-key.pem`.
- **Local install:** Settings → Appearance → Theme packs → Install a pack from a file… stands in for the catalogue until Phase 2.
- **Fallback:** a missing or broken pack falls back to the previous built-in theme, else Follow the system, with a message.
- **Grandfathering:** the first start of the new version marks existing installs (`holoKeep`). They keep their theme, and Holographic stays free for them.

## Where packs live

Packs are stored in the user's app-data folder, outside the installed app, so the installer never grows as the catalogue does.

```
<userData>/themes/
  index.json                  installed packs, versions, selected theme
  city-night/1.2.0/           one folder per pack and version
    manifest.json
    scene/ …  art/ …
  licences/city-night.lic     signed licence file (paid packs only)
  downloads/                  partial files, cleared on startup
```

The renderer reads packs through a `notepath://theme/<pack-id>/<path>` address handled by the main process. The handler refuses any path that climbs out of the pack folder and serves only allowed file types.

| Item | Where it lives | In the installer | In backups |
| --- | --- | --- | --- |
| Paper, Sepia, Graphite, Midnight, High Contrast | App code | Yes | Selection only |
| Downloaded packs | `<userData>/themes/` | No | No (the pack is re-downloaded) |
| Selected theme and pack list | Settings | Settings only | Yes |
| Licence files | `<userData>/themes/licences/` | No | Yes, so a restore keeps purchases |

Size budget: Light packs target under 1 MB, Medium under 5 MB, Rich under 15 MB. Settings shows each pack's size and a total, with a Remove button per pack. Uninstalling NotePath leaves packs in app data, as it does for notes.

## Install, update and remove

Installing a pack is a download handled entirely by the main process, so a failed or malicious download never touches the running interface.

1. The user taps Install on a pack in Settings. The catalogue entry gives the download address, size and checksum.
2. The main process downloads over HTTPS from an allowlisted host into `downloads/`, with progress shown in Settings.
3. It checks the file size against the catalogue, then the checksum and the signature (see Security).
4. It unzips into a temporary folder, runs the same validator that pack authors use, and rejects anything outside the allowed files and limits.
5. It moves the folder to `themes/<id>/<version>/`, updates `index.json`, and tells the renderer the pack is ready.
6. The user previews or applies it. Nothing restarts.

Updates: NotePath checks the catalogue at most once a day and on opening the Theme packs screen. A newer version downloads in the background only if the user taps Update. The old version stays until the new one validates, then is deleted.

Remove: deleting the pack folder and its `index.json` entry. If the removed pack was selected, NotePath returns to the previous built-in theme, else the system default (Paper or Graphite). Licence files stay so a purchase can be reinstalled.

| Situation | What NotePath does |
| --- | --- |
| Offline when installing | Says it needs a connection to download. Installed packs are unaffected. |
| Download interrupted | Keeps nothing partial; shows Try again. |
| Checksum or signature fails | Deletes the file and says the pack could not be verified. |
| Disk full | Cancels, cleans up, and shows how much space is needed. |
| Pack fails to load later | Falls back to the system default (Paper or Graphite) with a toast and marks the pack as needing reinstall. |
| Catalogue unreachable | Shows installed packs only, with no error banner. |

## Packet format (.nptheme)

A `.nptheme` file is an ordinary zip with a fixed layout. NotePath already has a zip reader in its import code, so no new dependency is needed.

```
city-night.nptheme
  manifest.json        required, see next section
  signature.json       required: file hashes + ed25519 signature
  preview.webp         required: 640 × 360 card image
  art/    *.webp *.avif *.svg *.png
  scene/  *.webp *.avif *.svg   sprite sheets and layers
```

| Rule | Limit |
| --- | --- |
| Allowed file types | `.json`, `.webp`, `.avif`, `.png`, `.svg` |
| Files per packet | 64 at most |
| Single image | 2 MB at most, 4096 px on the longest side |
| Whole packet | 15 MB at most (Rich), see the size budget |
| Folder depth | 2 levels |
| File names | lowercase letters, digits, hyphen, dot; no spaces |
| Not allowed | JavaScript, HTML, CSS files, fonts, video, executables, symlinks |

Why no video: video decodes on the GPU and is the heaviest thing a theme could add. Motion comes from moving a few still layers with transform and opacity, which low-end graphics handle well.

Why no CSS: a packet supplies values, and NotePath turns them into its own styles. That keeps a pack from restyling controls in ways that break readability.

## Manifest reference

`manifest.json` describes one pack. NotePath ignores unknown fields and rejects missing required ones.

| Field | Required | Meaning |
| --- | --- | --- |
| `schema` | Yes | Manifest version, currently `1` |
| `id` | Yes | Unique pack id, e.g. `city-night` |
| `name`, `author`, `version` | Yes | Display name, creator, semantic version |
| `weight` | Yes | `light`, `medium` or `rich` (see Performance contract) |
| `family` | Yes | `Light` or `Dark` for minimal packs; collection packs may use their own groups (Holographic keeps Dark, Nature, Water, Earth, Airy, Glass) |
| `minApp` | No | Oldest NotePath version that can run it |
| `license` | Yes | `free` or `paid`, plus a product id for paid packs |
| `preview` | Yes | Path to the 640 × 360 card image |
| `colors` | Yes | Colour tokens (next section) |
| `scenes` | No | Scene definitions per place (see Scenes) |
| `credits` | No | Artist and asset credits shown in Settings |

Example, City Night (a Medium pack):

```json
{
  "schema": 1,
  "id": "city-night",
  "name": "City Night",
  "author": "NotePath",
  "version": "1.0.0",
  "weight": "medium",
  "family": "Dark",
  "license": { "type": "paid", "product": "city-night" },
  "preview": "preview.webp",
  "colors": {
    "bg": "#0A0E17", "surface": "#111827", "accent": "#F5B83D",
    "tint": "#6FB7FF", "text": "#F2F5FA", "muted": "#C4CCDA",
    "faint": "#9AA5B8", "glow": "#F5B83D33"
  },
  "scenes": {
    "menu": {
      "still": "art/skyline.webp",
      "layers": [
        { "image": "scene/stars.webp", "motion": "twinkle", "min": "moderate" },
        { "image": "scene/plane.svg", "motion": "drift", "speed": 90, "min": "full" },
        { "image": "scene/cars.webp", "motion": "drift", "speed": 40, "min": "full" }
      ]
    }
  }
}
```

The skyline, stars, plane and cars are original artwork made for the pack.

## Colour tokens

A packet's `colors` block uses the same names NotePath's built-in themes use today, so an installed pack is registered beside the existing theme list and applied by the same function. Nothing about the editor, menus or settings needs to know a pack is involved.

| Token | Used for | Required |
| --- | --- | --- |
| `bg` | App background | Yes |
| `surface` | Panels, cards, windows | Yes |
| `accent` | Buttons, selection, links | Yes |
| `tint` | Secondary highlight | Yes |
| `text` | Main words | Yes |
| `muted` | Secondary words | Yes |
| `faint` | Hints and disabled words | Yes |
| `glow` | Soft halo on focus and hover | No (default none) |
| `glass` | Panel translucency, 0 to 1 | No (default solid) |

Rules:

- Colours are 6- or 8-digit hex only. No gradients, no images as colours.
- The validator checks contrast: `text`, `muted` and `faint` on `bg` and `surface` at least 4.5:1 (faint was 3:1 in draft 1), and `accent` against `bg` at least 3:1. A pack that fails is rejected, not adjusted.
- `glow` and `glass` are ignored in Lite, matching how Performance mode already strips them.
- High Contrast overrides any pack. If the user picks it, no pack colours or scene show.
- Art behind the editor is never used. Scenes colour the menu and margins, and the editor keeps `surface`.

## Scenes

A scene is a stack of image layers that NotePath's scene engine positions and animates. The packet declares what each layer is and how it moves; the engine decides whether it moves at all.

Places a scene may appear:

| Place | Allowed | Notes |
| --- | --- | --- |
| `menu` | Yes | The Main Menu is the showpiece |
| `margins` | Yes | Thin strips beside pages such as My Notes and Settings |
| `splash` | Yes | Short opening moment, still in Lite |
| Behind the editor or sheets | No | Text areas stay solid |
| Behind dialogs | No | Dialogs stay solid |

Motion types are a fixed list. Each one uses only transform or opacity, which keeps the work off the CPU and cheap for integrated graphics.

| Motion | Effect | Parameters |
| --- | --- | --- |
| `none` | Static layer | none |
| `drift` | Slow horizontal or vertical travel, looping | `speed` (px per second), `direction` |
| `float` | Gentle up-and-down bob | `amount` (px), `period` (s) |
| `twinkle` | Opacity pulses | `period` (s), `depth` (0 to 1) |
| `pulse` | Slow scale breathing | `amount`, `period` |

Each layer sets `min`: the lowest Performance mode in which it appears. A layer with `min: "full"` is skipped in Lite and Moderate.

| Performance mode | What the scene shows |
| --- | --- |
| Lite | The `still` image only, no animation, no layers |
| Moderate | The still plus layers marked `moderate`, at most 3 moving layers |
| Full | All layers, within the pack's weight budget |

Limits per scene: 8 layers at most, no layer larger than the viewport, and no loop shorter than 6 seconds. If the user turns on reduce motion, or the OS asks for it, every scene becomes its still image regardless of mode.

## Performance contract

Every pack declares one weight class, and the validator enforces its budget. These numbers are starting targets to confirm by measuring on the 6-core i7 with Intel UHD 630 that NotePath is tested on.

| Weight | Moving layers | Download | Memory for art | Auto mode shows it |
| --- | --- | --- | --- | --- |
| Light | 0 (still only) | under 1 MB | under 8 MB | Always |
| Medium | up to 3, slow | under 5 MB | under 30 MB | Moderate and Full |
| Rich | up to 8 | under 15 MB | under 80 MB | Full only |

How the budget is applied:

- **Auto never picks Rich.** Auto already never picks Full, so a Rich pack plays its still or Medium version unless the user sets Full themselves.
- **Pause rules.** All scene animation stops when the window is hidden or minimised, when a dialog or full-screen editor is open, and when reduce motion is on. It resumes only when the menu or margin is visible again.
- **Frame budget.** Scenes use the same jank watch as the rest of NotePath. If frames drop during the first 90 seconds, the scene falls back to its still image and a toast says why.
- **Decode on demand.** Art for a scene is decoded when the scene appears and released when it leaves, so an unused pack costs disk only.
- **No work when still.** A still scene is one image with no timers.

A pack's weight label is shown in Settings before download, so people choose knowing the cost.

## Accessibility contract

A theme may change how NotePath looks, never whether people can use it. These rules are checked by the validator and by NotePath's existing axe-core test run, which currently reports zero failures on every screen.

- **Contrast.** The colour rules above apply to every pack, and the axe run is repeated with each bundled free pack applied.
- **Text never sits on busy art.** Scenes appear only in the menu background and margins. Any text over a scene sits on a `surface` panel.
- **Reduce motion means still.** The in-app setting and the OS preference both turn every scene into its still image.
- **No flashing.** No layer may change brightness faster than once per second, and `twinkle` is limited to slow, shallow pulses.
- **Nothing carries meaning alone.** Art is decorative. Focus rings, selection and errors keep their own shapes and text, and a pack cannot recolour them below the contrast minimums.
- **Screen readers.** Scene images are hidden from assistive technology. Pack names and weight labels in Settings are real text.
- **Always an escape.** High Contrast and the four minimal presets ship in the installer and are never moved behind a purchase.

## Security

Packs come from outside the app, so the format is built so that nothing in one can execute.

- **No code.** Only JSON and images are accepted. A packet containing a script, HTML, CSS or any other type is rejected whole.
- **Safe SVG.** SVGs are checked and stripped of scripts, event handlers, external links and embedded documents. They are drawn as images, never inserted into the page.
- **Signed packets.** `signature.json` holds a SHA-256 hash of every file and an ed25519 signature over that list. NotePath ships the public key and refuses a packet that does not verify. The private key stays with Devon and is never in the app.
- **Path safety.** Zip entries with `..`, absolute paths or links are rejected. The `notepath://theme/` handler resolves each path and confirms it is inside the pack folder.
- **Network rules.** Downloads run in the main process, over HTTPS only, from a short allowlist of hosts, with a size cap taken from the catalogue and a time limit.
- **Content policy.** The page already allows images from `notepath:`; no other allowance is added. No remote images are loaded by a pack.
- **Creator packs later.** Third-party packs are signed by NotePath after review, not by their authors, until a creator programme exists.

## Licences

Free packs need no licence. Paid packs unlock with a small signed licence file, so they keep working offline.

| Kind | Unlock | Who gets it |
| --- | --- | --- |
| Bundled | None | Everyone: Paper, Sepia, Graphite, Midnight, High Contrast. Never paid. |
| Grandfathered | Local entitlement written by the update | Installs that existed before Holographic became a pack keep it free |
| Free download | None | Everyone, for the cost of the download |
| Paid | Signed `.lic` file | Buyers of that pack only; every pack is its own product on your website |

A `.lic` file holds the pack id, a purchase id, an optional buyer reference and an ed25519 signature. NotePath verifies it with the same public key as packets, stores it in `themes/licences/`, and checks it at pack load with no network call. Paid packs can be previewed (still image and a short scene preview) before purchase.

Honest limits: a licence file can be copied, and a determined person can strip any check from a desktop app. The goal is to keep honest buyers honest, not to build a lock. Do not spend effort on obfuscation. Licence binding to a device is a decision for Devon (see Decisions).

Refunds and lost licences are handled by re-issuing the `.lic` from the purchase record. Free packs never turn into paid ones; a pack's licence type is fixed for each version.

## Catalogue and delivery

The catalogue is one small signed `catalog.json` file on a website or CDN. It lists every pack: id, name, weight, size, price type, version, preview address, download address and checksum.

- **Hosting.** Static files on a CDN or object storage, HTTPS only. A static site is enough to start, and the same files can serve both the in-app browser and a web page.
- **Signing.** The catalogue is signed with the same key as packets, so a hijacked host cannot add packs.
- **Versioning.** Each pack version has its own folder and file, so an old version never changes under a user. Each manifest sets `minApp`; the catalogue hides packs the installed app cannot run.
- **Delisting.** A pack removed from the catalogue stops being offered but stays on the machines that have it. A pack withdrawn for safety is listed in a `revoked` array, and NotePath removes it on the next catalogue check and falls back to the system default.
- **Caching.** NotePath keeps the last catalogue it fetched so Browse still shows packs when offline, marked as unavailable to download.

## In-app experience

Theme packs live in Settings under Display, beside the Performance control, with two tabs: Installed and Browse.

- **Installed.** Cards for the four presets, High Contrast and each downloaded pack (Holographic among them), each with its preview, weight label (Light, Medium, Rich), size on disk, Apply and Remove.
- **Browse.** Cards from the catalogue with preview, weight label, download size, Free or price, and Install. A line says what the card costs in speed, for example "Rich: best with Full performance mode".
- **Recommendation.** In Auto mode, Browse marks packs the computer will run well and says plainly when a pack will show as a still image.
- **Preview before download.** Tapping a card shows the still image and, where the pack allows, a short loop played at the current performance level.
- **Storage line.** "Theme packs use 12.4 MB" with a Remove-all button.

Messages use the same plain wording as the rest of NotePath: "Needs a connection to download", "Couldn't verify this pack, so it wasn't installed", "Not enough disk space: 6 MB needed". Applying a pack shows it at once and keeps the previous theme one tap away through Undo.

## Changes needed inside NotePath

| Area | Change |
| --- | --- |
| `web/src/settings.js` | Theme registry that merges installed packs into the existing theme list; Theme packs UI; selection saved in settings; scene performance gate in `applyAll` |
| New `web/src/scenes.js` | Scene engine: layers, the five motions, pause rules, still fallback. Loaded lazily through `NPLazy` so it costs nothing until a pack with scenes is applied |
| `main.js` | `notepath://theme/` handler with path checks; `themes:*` IPC for catalogue, install, remove, list; download, verify, unzip, validate; daily catalogue check; revoked-pack removal |
| `preload.js` | `themes: { catalog, install, remove, list, licence }` |
| Content Security Policy | Confirm `img-src` allows `notepath:` for pack art; no new sources |
| Backups | Keep selection and licences, skip pack files |
| `tools/theme-check.js` | The validator (see next section) |
| Tests | Unit tests for manifest and signature checks; interact tests for install, apply, remove and fallback with a local test pack; axe run with each bundled pack |
| `CLAUDE.md` | Document the format, folders and rules |

## Authoring and validation

A command-line checker, `tools/theme-check.js`, is the single source of truth for what a pack may contain. The app runs the same code on install, so what passes for authors passes for users.

The checker verifies the manifest fields, file types and sizes, the colour contrast rules, the weight budget (layer count, download and decoded size), SVG safety, loop timing and path rules. It prints a plain report and a weight class it recommends.

A pack is made in five steps:

1. Create a folder with `manifest.json`, `preview.webp`, and `art/` and `scene/` images.
2. Run `npm run theme:check <folder>` until it passes.
3. Run `npm run theme:pack <folder>` to build and sign the `.nptheme` file.
4. Install it locally to test in Lite, Moderate and Full, with reduce motion on and off.
5. Add it to the catalogue and publish.

## Decisions, risks and phases

Decisions needed from Devon:

| Decision | Options | My lean |
| --- | --- | --- |
| Hosting | Static site or CDN you control, or a third-party store | Own static site first, it is cheapest and simplest |
| Store model | Curated by you, or open to creators | Curated first; creators later with review |
| Pricing | Free base set plus paid scene packs; one-off price or subscription | Each pack sold separately as its own product, one-off price; bundles optional later |
| Licence binding | Per account, per device, or none | None or per account; per-device annoys honest users |
| Where to buy | In-app store, or a website that issues a licence file | Website first; in-app browse and install only |

Risks:

- **Frame cost is unmeasured.** The weight budgets are targets until measured on the 6-core i7 with UHD 630 and on a Mac.
- **Art takes real work.** Original scenes (skyline, plane, cars, fairy glade) must be made or commissioned. Reusing known characters or brands is not allowed.
- **Payments and tax** need a provider and the right business setup. This spec does not cover them, and it is not legal advice.
- **Signing key loss** would block new packs. Keep an offline backup of the private key.

Build phases:

1. **Foundation.** Folders, `notepath://theme/` handler, registry, install and remove from a local file, validator, tests. Ship two free Light packs.
2. **Delivery.** Signed catalogue, download and verify, Browse and Installed screens, backups rule, revocation.
3. **Scenes.** Scene engine, still and moderate modes, City Night prototype, performance measurement.
4. **Paid packs.** Licence files, purchase page, preview before buying.
5. **Creators.** Review process and creator signing, only if there is demand.
