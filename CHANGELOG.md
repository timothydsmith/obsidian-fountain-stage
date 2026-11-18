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
- Live Preview, source mode and reading view, as for notes. Source mode is the plain text, unformatted. Reading view shows the formatted script without its markup, notes, synopses or boneyard, and can't be edited. Scripts open in the mode set by Obsidian's **Default view for new tabs** and **Default editing mode** settings, and each tab remembers its mode. Switch with the button at the top of a script, its **More options** menu, the **Toggle reading view** and **Toggle source mode** commands, or the same hotkeys as notes (Ctrl/Cmd+E for reading view).
- Character names complete as you type. Typing two capital letters in a row anywhere in a line, in a cue or a stage direction, offers the script's character names that start that way, from its cues (those with the most lines first) and its Characters list. Enter or Tab picks one, and Escape closes the list. Once a whole name is typed, nothing more is offered, so Enter after a cue starts a new line.
- Tab sets what a line is. On an empty line after a blank line, it lists the script's character names to pick from, narrowed as you type. On a line of text, it changes the line from action to character to scene heading to transition and back, with Shift+Tab going the other way; going round gives the original text back, and forcing marks are only added where needed. In a speech, it switches a line between dialogue and parenthetical, or starts a parenthetical on an empty line. **Next line type** and **Previous line type** commands do the same for touch keyboards.
- Text before the play begins is only treated as preface (author's notes and the like) until the first act, scene, scene heading or character cue. A script with speeches but no scene headings no longer reads as all preface, so its stage directions are formatted and exported as stage directions.
- The status bar shows what the cursor's line is, such as Character, Dialogue, Parenthetical, Stage direction, Scene heading, Act or Scene, as Playwright reads it.
- A script outline in the sidebar, opened with **Show script outline**. It lists the acts, scenes and scene headings of the script you're in, nested, with each one's synopsis. Click one to go there. The part you're in is highlighted, and the outline updates as you type. Acts and scenes with others inside them can be collapsed.
- **New script** command and ribbon button, which create `Untitled.fountain` in the folder Obsidian uses for new notes.
- **Export to PDF**, from the command palette, a script's file menu, or the button at the top of an open script. It lays out the script as a stage play in one of three built-in house styles: Modern Play Format (Dramatists Guild), Australian Plays Transform (APT), or Samuel French / SFI. Pages break in the same places fountain2pdf put them. The PDF is saved next to the script with the same name, replacing any earlier export, and opens in a new tab.
- A `Style:` key on the title page picks the export style, for example `Style: apt`. It's never printed. Without one, you choose a style when you export. **Export to PDF in a chosen style** always asks.
- Styles of your own: JSON files in a styles folder that `extends` a built-in style or another of yours and change only the settings that differ. Lengths take units (`"25mm"`, `"1in"`). A file with problems is left out, and each problem is listed with the setting and the reason.
- Fonts from your vault: `.ttf` and `.otf` files in a fonts folder, matched by the family named in the file, so APT can use real Palatino. Without the font, PDFs use the style's fallback (Times for the built-in styles) and say so.
- Settings for the styles and fonts folders, which also list the styles and font families Playwright found and any problems with them.
