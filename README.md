# NotePath

A desktop notes console for everything you would use a notepad for: quick notes, lists and checklists, meeting and study notes, photos, video, code and music. Built by Wolfie's Coven with the same console look as Inquire.

## Download
Get the latest installer from [Releases](https://github.com/InquiringOwl/notepath-desktop/releases/latest):

- **macOS**: `NotePath-<version>-arm64.dmg` (Apple Silicon) or `NotePath-<version>-x64.dmg` (Intel). The app is not notarised yet: the first time, right-click NotePath in Applications and choose **Open**.
- **Windows**: `NotePath-Setup-<version>.exe`
- **Linux**: `NotePath-<version>.AppImage` (make it executable, then run it)

NotePath checks for updates when it starts and every 4 hours, downloads them in the background and offers **Install & Relaunch** (Settings → About shows the status).

## What it does
- **Main Menu** with **My notes**, **My Tasks**, **My Code**, **My Music** (coming soon) and **Note Office**, plus your three most recent notes.
- **My notes**: nested folders (click a folder's icon to fold it), favourites, drag-and-drop ordering, a Search box above the folders that looks through every note, notes shown as icons, a list, a compact list or details (with columns you can resize), cover photos for notes and code files, a line under the title with when the note and folder were made and last edited (MM/DD/YY hh:mm:ss AM/PM), ‹ Back to the window you had open before, Undo / Redo, Delete with Undo.
- **Rich text**: bold, italic, underline, titles, subtitles and three heading levels (the H tab), strikethrough, bullets, numbered lists and checklists (press again to indent, delete to take them off), fonts, sizes, text and highlight colours with your own presets (also on an empty line), align & indent, line & paragraph spacing and clear formatting (for the whole note, or only the words selected), emoji and symbols.
- **Widgets**: code boxes with highlighting, music charts and lead sheets you can play, graphs that write their equations; photos and videos (files, YouTube, Vimeo).
- **Links**: drag a note or a folder into a note to link to it, open links side by side or 👁 peek at them in a small box, and see the notes that link here and the links in a note in the ◈ Links panel.
- **Paranotes**: your own notes under the words or code they explain, in their own colour, with web links.
- **My Code**: Python, C, C++, JavaScript and Java files in the VS Code editor, run right in the app.
- **My Tasks**: priorities, due dates, reminders, places on a map, pictures and files.
- **Note Office**: your notes as a little animated office.
- **Share**: copy a link that opens the note in NotePath, copy its words, send a copy as text, a web page, Word or PDF, and import or export Word, Markdown (Obsidian), Apple Notes / Evernote, web pages, PDF and text.
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
