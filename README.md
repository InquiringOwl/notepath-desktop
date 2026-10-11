# NotePath

A desktop notes console for everything you would use a notepad for: quick notes, lists and checklists, meeting and study notes, photos, video, code and music. Built by Wolfie's Coven with the same console look as Inquire.

## Download
Get the latest installer from [Releases](https://github.com/InquiringOwl/notepath-desktop/releases/latest):

- **macOS**: `NotePath-<version>-arm64.dmg` (Apple Silicon) or `NotePath-<version>-x64.dmg` (Intel). The app is not notarised yet: the first time, right-click NotePath in Applications and choose **Open**.
- **Windows**: `NotePath-Setup-<version>.exe`
- **Linux**: `NotePath-<version>.AppImage` (make it executable, then run it)

NotePath checks for updates when it starts and every 4 hours, downloads them in the background and offers **Install & Relaunch** (Settings → About shows the status).

## What it does
- Start menu with **My notes**, **New note**, **Favourites** and your three most recent notes.
- Nested folders, favourites, drag-and-drop ordering, search, Save as Markdown, Delete with Undo.
- Rich text: bold, italic, underline, strikethrough, headings, bullets, numbered lists, checklists, text sizes and colours, emoji and symbols.
- Photos, videos (files, YouTube, Vimeo), code boxes with highlighting, music charts you can play.
- Right-click a word for a dictionary definition, or to link it to another note.
- Twelve themes plus your own colours, adjustable text and interface size, rebindable shortcuts, one-file backups.

Your notes stay on your computer.

## Develop
```
npm install
npm start            # build and run
npm run check        # build + unit + smoke + interaction tests (needs: npx playwright install chromium)
npm run release -- patch "What changed"   # tag a release; GitHub builds macOS, Windows and Linux
```
See `CLAUDE.md` for the full working brief.
