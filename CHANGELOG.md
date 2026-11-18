# Changelog

All notable changes to Playwright are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

Add new entries under **Unreleased** as you work on `dev`, grouped as Added, Changed, Fixed or Removed. When you release, rename **Unreleased** to the version and date, and start a fresh **Unreleased** section above it. The full steps are in the README under [Branches and releases](README.md#branches-and-releases).

## [Unreleased]

### Added
- `.fountain` files open in Playwright's own editor.
- Formatting as you type, laid out as a stage play: act and scene headings centred, character cues centred, parentheticals and stage directions in italics, transitions to the right, and `*italic*`, `**bold**` and `_underline_` shown as they'll print. Forcing marks (`.`, `@`, `!`, `~`, `>`, `<`, `^`), section `#`s and emphasis markers stay visible but faint. Notes are highlighted and boneyard text is dimmed. The title page and any `***Characters***`-style breakdown sections are shown as such.
- The editor follows Obsidian's **Readable line length** setting.
- Each script reopens where you left it, with the cursor and scroll position you had, including after Obsidian restarts. Positions are kept on each device rather than synced, and follow a script when it's renamed. Obsidian's back and forward buttons return to the same place too.
- Line numbers for every line of a script, shown when Obsidian's **Settings → Editor → Show line number** is on, the same as for notes. Changing the setting updates open scripts straight away.
- **New script** command and ribbon button, which create `Untitled.fountain` in the folder Obsidian uses for new notes.
- **Export to PDF**, from the command palette, a script's file menu, or the button at the top of an open script. It lays out the script as a stage play in one of three built-in house styles: Modern Play Format (Dramatists Guild), Australian Plays Transform (APT), or Samuel French / SFI. Pages break in the same places fountain2pdf put them. The PDF is saved next to the script with the same name, replacing any earlier export, and opens in a new tab.
- A `Style:` key on the title page picks the export style, for example `Style: apt`. It's never printed. Without one, you choose a style when you export. **Export to PDF in a chosen style** always asks.
- Styles of your own: JSON files in a styles folder that `extends` a built-in style or another of yours and change only the settings that differ. Lengths take units (`"25mm"`, `"1in"`). A file with problems is left out, and each problem is listed with the setting and the reason.
- Fonts from your vault: `.ttf` and `.otf` files in a fonts folder, matched by the family named in the file, so APT can use real Palatino. Without the font, PDFs use the style's fallback (Times for the built-in styles) and say so.
- Settings for the styles and fonts folders, which also list the styles and font families Playwright found and any problems with them.
