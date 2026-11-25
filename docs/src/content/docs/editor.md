---
title: "Writing in the editor"
description: "The script editor: formatting as you type, modes, character names, Tab, page breaks, and finding text."
---

Fountain Stage opens `.fountain` files in an editor of its own, which formats Fountain as you type. Line numbers and line width follow Obsidian's own **Settings → Editor → Show line number** and **Readable line length**, so scripts and notes match.

## New scripts

**New script**, from the command palette or the ribbon, makes an untitled script where Obsidian puts new notes, and opens it.

To make a whole play's folders and its first script, see [Setting up](../setting-up/).

## Formatting and modes

Scripts are formatted as you type, following the [Fountain spec](https://fountain.io/syntax/). As for notes, there are three modes: Live Preview, source mode and reading view. Scripts open in the mode set by Obsidian's **Default view for new tabs** and **Default editing mode** settings. Switch with the button at the top of a script, its **More options** menu, the same hotkeys as notes (Ctrl/Cmd+E for reading view), or **Toggle reading view** and **Toggle source mode** in the command palette.

- **Live Preview** formats the script as you type, with the markup shown faintly.
- **Source mode** is the plain text, unformatted.
- **Reading view** shows the formatted script without its markup, sections, notes, synopses or boneyard, and can't be edited. Links to notes show as links.

## Acts, scenes and sections

Acts, scenes and sections follow the Fountain spec:

- **Acts** are scene headings such as `.ACT ONE`. Which headings count as acts is set by the style (`act.pattern`; by default, those starting with "Act"), and so is whether each act starts a new page.
- **Scenes** are scene headings: `INT.` and `EXT.` headings, or any line forced with a full stop, such as `.SCENE TWO` or `.A STUDENT SUPPORT OFFICE`.
- **Sections** (`#`, `##` and deeper) are structure only. They never print, reading view hides them, and the editor shows them faintly. Use them to group scenes in the outline, for example by story beat.
- Other printed titles come from centred text (`> INTERVAL <`) and `===` page breaks.

## Character names

Character names complete as you type. Type two capital letters in a row anywhere in a line, in a cue or a stage direction, and Fountain Stage offers the names that start that way: from the script's cues (most lines first) and its Characters list. Enter or Tab picks one; Escape closes the list. Names of several words work too (`MRS SM` offers MRS SMITH).

## Tab and line types

Tab sets what a line is:

- On an empty line after a blank line, where you'd start a stage direction, Tab lists the script's character names. Type to narrow the list, then Tab or Enter to pick a name.
- On a line of text, Tab changes it from action to character to scene heading to transition and back to action, and Shift+Tab goes the other way. The line is changed from how it was before your first Tab, so going round gives it back, and a forcing mark (`!`, `@`, `.`, `>`) is only added where the text needs it.
- In a speech, Tab switches a line between dialogue and parenthetical, and on an empty line under a cue or dialogue, starts a parenthetical.
- **Change to next line type** and **Change to previous line type** do the same, for the mobile toolbar.

## The status bar

The status bar shows what the line you're on is: Character, Dialogue, Stage direction, Scene heading and so on, as Fountain Stage reads it. A cue with no dialogue under it yet reads as a stage direction. Beside it is who's on stage at the cursor, going by the entrances and exits. See [Cast](../cast/).

## Page breaks

With page breaks on, a rule runs across the script where each page of its PDF starts, labelled with the page's number, in Live Preview and reading view. Pages break as they would in the style the script's `Style:` key names (otherwise the **Style for page breaks** setting), with the same fonts. They catch up a moment after you stop typing. A page that starts partway through a long paragraph gets its rule after the paragraph, saying so. The status bar shows the page you're on and the page count.

## Finding text

Find and replace in a script with the same hotkeys as notes (Ctrl/Cmd+F to find, Ctrl/Cmd+H to replace) or **Find in script**. A bar at the top of the script finds text, with options to match case, use a regular expression or match whole words. Enter or F3 goes to the next match, Shift+Enter or Shift+F3 to the one before, and Escape closes the bar. In reading view, and so in frozen drafts, it only finds.

**Search scripts** finds text in every script in the vault, since Obsidian's own search doesn't look inside .fountain files. It opens in the left sidebar and lists each line that matches, grouped by script, and catches up as scripts change. Click a line to go there, with the match selected (Ctrl/Cmd-click opens it in a new tab). Frozen drafts are left out unless you tick **Include drafts**. Text you've selected on one line of a script becomes the search.

## Line numbers and your place

Every line of the file is numbered in the editor when Obsidian's **Show line number** setting is on. Each script reopens where you left it.
