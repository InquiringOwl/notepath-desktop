# NotePath: working brief

Read this first in every session. Keep it short and current: update it in the same commit as any change it describes.

## What NotePath is
A desktop notes console (Electron) for every kind of note a person would reach for a notepad for: quick lines, lists and checklists, meeting notes, study notes, photos, video, code and music. It is **the note-taking system of Inquire, cloned into its own app** (Inquire: `~/Documents/codex-desktop`, repo `InquiringOwl/inquire-desktop`). **Never edit Inquire's folder from this project.**

- **Start menu** (`renderMenu` in `web/src/app.js`): eyebrow "NotePath", heading "Main Menu". A **Notes** console window (`.npn`) with three buttons, **My notes**, **＋ New note** (asks for a title, then opens it) and **Favourites** (My notes filtered to starred notes), and under them **Recent**: the three most recently edited notes. Below it, **three buttons labelled only "Coming soon"**, not linked to anything (`.npn-soon`, `aria-disabled`). Replace one when Devon names the feature it should hold.
- **My notes** is a window over the start menu (`openNotesWin` → `renderNotes`, nearly full screen): folders column · notes list · editor. Everything from Inquire 1.19: nested folders with drag and drop, Favourites, Unfiled, My order (drag, Alt+↑/↓) or Recently edited, ★ first, search, fold tabs and a resizable list, Delete with Undo, Save as .md, photos (file, paste, drop, link), note-to-note links.
- **Editor** (`mountEditor` in `notes.js`, toolbar in `notes-widgets.js`): bold, italic, underline, **strikethrough**, **heading**, **bulleted list, numbered list, checklist** (NotePath additions), four text sizes, nine text colours, emoji + symbols panel, **Code box** (highlighting, line numbers), **Music chart** (staff, keyboard, chords, playback), **Video** (file, YouTube, Vimeo, https link).
- **Right-click** on selected words in a note (`textmenu.js`): Copy · **Define · Dictionary** (Wiktionary → Wikipedia → dictionaryapi.dev, shown in the menu; ＋ Save to note puts it under the line) · **Link to a note**. Inquire's Glossary item is gone (NotePath has no glossary).
- **Not carried over (Devon's choice, Oct 2026)**: sign-in screen and accounts (NotePath opens straight to the start menu; one set of notes per computer), the Assist dock / floating Notes box, and everything about subjects, lessons, labs, glossary and achievements. Notes no longer link to subjects/fields/lessons.
- **Settings** (Esc or the top-bar Settings button): Appearance (Inquire's 12 themes, Your colours + 3 presets, note link colour), Display & comfort (text size, interface size, reduce motion), Shortcuts (rebindable: Esc Settings, Alt+M menu, Alt+N My notes, Alt+Shift+N new note, Alt+F favourites, Alt+⌫ back), Usage (invert scroll), Data & backups (export/import one JSON file with notes, folders, photos, videos ≤ 25 MB and settings), About (updates, EULA, repo link).

## Look (same as Inquire; follow it unless Devon says otherwise)
- EVE Online-inspired console: dark glass windows (`.win`: `--win-1/-2` gradient, thin `--line` border, bright corner tick top-left and a fainter one bottom-right), header strips (`.win-h`: small uppercase Saira label, letter-spaced, glowing square dot), slots (`.slot`) for big menu buttons.
- Palette: amber `#F2B84B`, cyan `#5CC8E0`, pink `#F07CA0`, violet `#B49BFF`, green `#7BD88F`; magenta `#D97AE6`, lime `#B5D65A`, red `#E5675B`. **UI chrome uses `var(--frame)`** (the theme's accent), never a fixed colour; amber is for stars/favourites, green for done/ticked, red for delete/warnings.
- Fonts bundled in `app/fonts`: STIX Two Text (headlines, note titles), IBM Plex Sans (body), IBM Plex Mono (counts, code), Saira Semi Condensed (uppercase labels). Noto Sans Symbols subset for alchemical symbols.
- Symmetry: boxes side by side share top and bottom edges; an incomplete row is centred; check at 1440, ~1000 and 400 px. Motion is a soft fade/blur (`vt-in`), always off under Reduce motion.
- Logo: a placeholder drawn by `tools/art/make-icon.py` (a console note page with a lit path of dots): `build/icon.png` (1024, electron-builder makes icns/ico), `app/brand/np-mark-64.png` (top bar, inlined by build-web). The wordmark is the text "NOTEPATH" in the top bar. Replace both when Devon supplies a logo.

## Identity (separate from Inquire and Inquire Law, so the apps never collide)
- Product **NotePath**, `appId com.wolfiescoven.notepath`, npm name `notepath-desktop`, version started at **0.1.0**, scheme `notepath://` (CSP in build-web.js), localStorage keys `notepath.*` (`notepath.notes._local`, `notepath.notefolders._local`, `notepath.settings`, `notepath.nbw` …), photos/videos in IndexedDB `notepath-notes`, userData folder "NotePath". Installer names `NotePath-…`.
- Repo and update source: **public `InquiringOwl/notepath-desktop`** (package.json `build.publish`, main.js `OWNER`/`RELEASES_REPO`, tools/release.js, Settings → About). `node tools/unit.js` fails if these drift apart.
- Internal code names stay Inquire's on purpose so fixes can be copied between the apps: preload bridge `window.inquireDesktop`, `InquireNotes`, `InquireWidgets`, `InquireSettings`, `InquireApp`, events `inquire:notes-changed`, `inquire:window`, `inquire:route`. They are never shown to users.

## Where things are
| Path | What |
| --- | --- |
| `web/src/app.js` | Start menu, routing (`#menu`, `#notes`, `#favourites`), windows over the app (`modalWin`), My notes (`renderNotes`, `notesLayout`), New note dialog (`askText`), update banner, `window.InquireApp` (shortcuts, `openNotes`, `newNote`) |
| `web/src/notes.js` | Notes store (`InquireNotes`: list/create/update/folders/order/trash/undo), sanitiser (whitelist; keeps `ul[data-ck]`, `li[data-done]`, `strike`), photos + videos in IndexedDB, `mountEditor`, pickers, checklist ticking |
| `web/src/notes-widgets.js` | Toolbar (`InquireWidgets.toolbar`, headings/lists/checklist in `block()`), emoji/symbol panel, Code box, Music chart, Video |
| `web/src/textmenu.js` | Right-click menu: Copy, Define · Dictionary (+ Save to note), Link to a note |
| `web/src/settings.js` + `settings.css` | Settings window, themes, shortcuts (`KEYACTS`), backups, About/updates; documents via `InquireSettings.openDoc("eula")` (`eula.js`, STARTER DRAFT with [bracketed] blanks: needs a lawyer before selling) |
| `web/src/style.css`, `menu.css` | Inquire's base styles and notes styles, cut down to what NotePath uses |
| `web/src/notepath.css` | NotePath's own: the start menu Notes console, Coming soon row, checklists, strikethrough |
| `web/lib/python-tokens.js`, `music-theory.js` | The DOM-free parts of Inquire's CS and Music kits that the Code box and Music chart need (`CSRules.tokens`, `MusicTheory`) |
| `main.js`, `preload.js`, `updater-mac.js` | Electron shell, `notepath://` scheme, dictionary fetch (`dict:lookup`, host allowlist), updates (Mac self-updater; Windows/Linux electron-updater; checks at launch + every 4 h) |
| `build/after-pack.js` | Ad-hoc signs the Mac app (no Apple Developer ID yet) |
| `.github/workflows/check.yml`, `release.yml` | CI checks on every push; Release builds Mac (dmg + zip, arm64 + x64), Windows (nsis) and Linux (AppImage) on a `v*` tag and publishes the GitHub Release with `latest*.yml` |
| `tools/` | `build-web.js`, `unit.js`, `smoke.js`, `interact.js`, `release.js`, `art/make-icon.py` |

## Commands
- `node tools/build-web.js`: builds `app/index.html` (desktop) and `dist-web/notepath.html` (browser preview). Fails on any syntax error.
- `node tools/unit.js` (~1 s): every script parses, identity is consistent, helper rules work.
- `node tools/smoke.js` (~20 s): headless Chromium opens the start menu, My notes, Favourites, New note and every Settings tab at desktop and phone width; fails on any JS error/warning or sideways scroll.
- `node tools/interact.js` (~30 s): drives the features (60 checks): menu buttons + Coming soon inert, folders/order drag and drop, ★ first, resize/fold, sizes, headings, lists, checklists (tick + reload), strikethrough, code, music, video, right-click Dictionary + Save + Link, delete + Undo, shortcuts, theme, backup export → import. **Add a check here for every new interactive feature.**
- `npm run check`: build + unit + smoke + interact. Run before every commit that touches `web/`.
- `npm start`: build and open the app locally (updates are only checked in installed copies).
- One-time setup on a new machine: `npm install && npx playwright install chromium`.
- The device shell (Cowork) can't download Playwright's Chromium: run smoke/interact in the cloud container (copy the folder, `npm i playwright@1.56.0` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, Chromium is preinstalled there) and bring changes back. Build and unit run fine on the device.
- Don't run `git status` (or other git commands) from the device shell: it can leave `.git/index.lock`, which that shell can't delete. Devon runs git in Terminal.

## Release (auto-update reaches every installed copy)
`npm run release -- patch "Short note"` (or `minor`, `major`, exact `X.Y.Z`). It refuses if GitHub has newer commits, runs `npm run check`, bumps the version, commits everything, pushes, tags and pushes the tag. Devon runs it in Terminal (the device shell has no GitHub credentials). The Release workflow runs the Check workflow first; if it fails, nothing is published. Builds take ~5 min. Then confirm the release lists `latest-mac.yml`, `latest.yml` and `latest-linux.yml` (if one platform's upload dropped, Actions → the run → **Re-run failed jobs**). Check status from the device shell: `curl -s https://api.github.com/repos/InquiringOwl/notepath-desktop/actions/runs?per_page=3`.
- macOS: the app is ad-hoc signed, not notarised. First launch: right-click → Open. Updates install themselves (`updater-mac.js` swaps the app from the release zip); if macOS blocks it, the banner says where the download is.

## Bringing improvements over from Inquire
NotePath's notes engine is Inquire's, so a fix there usually fits here: compare `web/src/notes.js`, `notes-widgets.js`, `textmenu.js`, `settings.js` and the notes part of Inquire's `app.js` (`renderNotes`, `notesLayout`, `askText`, `modalWin`), copy the change, then replace `codex.`/`inqlaw.` storage prefixes with `notepath.` and drop anything about subjects, lessons, glossary, accounts or the Assist dock. `npm run check` must pass.

## Working efficiently (for Claude)
- `~/Documents/notepath-desktop` is the source of truth. Edit in place with device_bash; don't stage files into the cloud just to read or edit them.
- Use `unit.js`, `smoke.js` and `interact.js` to confirm nothing broke rather than re-reading big files. Look at one desktop and one phone screenshot of anything visual you change.
- Ask Devon before adding a feature to a Coming soon slot, changing the identity, or changing the look away from Inquire's.
