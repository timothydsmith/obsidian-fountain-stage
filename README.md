# Fountain Stage

An [Obsidian](https://obsidian.md) plugin for writing scripts in [Fountain](https://fountain.io/syntax/), with formatting as you type, line numbers, and export to stage-play PDFs in a choice of house styles.

It's in Obsidian's [community plugin directory](https://community.obsidian.md/plugins/fountain-stage): see [Install](#install).

Line numbers and line width follow Obsidian's own **Settings → Editor → Show line number** and **Readable line length**, so scripts and notes match.

## Features

- Formatting as you type, following the Fountain spec.
- Line numbers for every line of the file, shown in the editor when Obsidian's **Show line number** setting is on.
- Live Preview, source mode and reading view, as for notes. Scripts open in the mode set by Obsidian's **Default view for new tabs** and **Default editing mode** settings. Switch with the button at the top of a script, its **More options** menu, or the same hotkeys as notes (Ctrl/Cmd+E for reading view).
  - **Live Preview** formats the script as you type, with the markup shown faintly.
  - **Source mode** is the plain text, unformatted.
  - **Reading view** shows the formatted script without its markup, sections, notes, synopses or boneyard, and can't be edited.
- Acts, scenes and sections follow the Fountain spec:
  - **Acts** are scene headings such as `.ACT ONE`. Which headings count as acts is set by the style (`act.pattern`; by default, those starting with "Act"), and so is whether each act starts a new page.
  - **Scenes** are scene headings: `INT.` and `EXT.` headings, or any line forced with a full stop, such as `.SCENE TWO` or `.A STUDENT SUPPORT OFFICE`.
  - **Sections** (`#`, `##` and deeper) are structure only. They never print, reading view hides them, and the editor shows them faintly. Use them to group scenes in the outline, for example by story beat.
  - Other printed titles come from centred text (`> INTERVAL <`) and `===` page breaks.
- Character names complete as you type. Type two capital letters in a row anywhere in a line, in a cue or a stage direction, and Fountain Stage offers the names that start that way: from the script's cues (most lines first) and its Characters list. Enter or Tab picks one; Escape closes the list. Names of several words work too (`MRS SM` offers MRS SMITH).
- Tab sets what a line is:
  - On an empty line after a blank line, where you'd start a stage direction, Tab lists the script's character names. Type to narrow the list, then Tab or Enter to pick a name.
  - On a line of text, Tab changes it from action to character to scene heading to transition and back to action, and Shift+Tab goes the other way. The line is changed from how it was before your first Tab, so going round gives it back, and a forcing mark (`!`, `@`, `.`, `>`) is only added where the text needs it.
  - In a speech, Tab switches a line between dialogue and parenthetical, and on an empty line under a cue or dialogue, starts a parenthetical.
  - **Next line type** and **Previous line type** do the same, for the mobile toolbar.
- **Rename character**, from the command palette or a script's **More options** menu, renames a character throughout the script: its cues, its Characters list entry, and its name in stage directions, headings, notes and dialogue. Each is written in the case the old name was, so MARGARET becomes JANE and Margaret's becomes Jane's. A name all in lower case is left alone, so renaming WILL doesn't touch "will". The character is the one at the cursor, or one you choose. Before anything changes you see how many places of each kind will change, and where, and can leave any kind out. It's one step to undo.
- The status bar shows what the line you're on is: Character, Dialogue, Stage direction, Scene heading and so on, as Fountain Stage reads it. A cue with no dialogue under it yet reads as a stage direction.
- A script outline in the sidebar, since Obsidian's own outline only reads notes. It lists the script's acts, sections and scenes, nested (scenes inside the section or act they follow, sections inside their act), with any synopsis (`= …`) under its heading and how long each runs. Click one to go there, or drag a scene to move it. On a phone, or anywhere, right-click a scene or press and hold it for **Move scene up** and **Move scene down**. The part you're in is highlighted, and the outline updates as you type. It opens in the right sidebar the first time you open a script in the vault (on a phone, it's added to the right sidebar without opening it). If you close it, bring it back with **Show script outline**.
- Page breaks: a rule across the script where each page of its PDF starts, labelled with the page's number, in Live Preview and reading view. Pages break as they would in the style the script's `Style:` key names (otherwise the **Style for page breaks** setting), with the same fonts. They catch up a moment after you stop typing. A page that starts partway through a long paragraph gets its rule after the paragraph, saying so. The status bar shows the page you're on and the page count.
- A runtime estimate, in the status bar for the whole script and in the outline for each act and scene. It goes by one of two methods, set in Fountain Stage's settings:
  - **Words spoken** (the default): dialogue at 150 words a minute, stage directions at half that, and the pauses the script asks for. A pause word (beat, moment, pause, silence) counts in any parenthetical, and in a stage direction where it stands on its own, as in "Beat.", "A long silence." or "After a pause, she sits", but not "A moment later". Each pause word has its own time, a short time (after short, brief, slight, tiny, little or quick) and a long time (after long, longer, lengthy, extended, endless or interminable). A number multiplies it, so "two beats" is twice a beat, and plurals count too. Change the times, or add words and phrases of your own (such as "lights fade"), under **Pause words** in Fountain Stage's settings.

    | Word | Seconds | Short | Long |
    |---|---|---|---|
    | beat | 1 | 0.5 | 2 |
    | moment | 2 | 1 | 4 |
    | pause | 2 | 1 | 4 |
    | silence | 5 | 2.5 | 7 |

    The times for pause and silence follow the Author's Note to Annie Baker's *Circle Mirror Transformation*. Baker calls a beat less than a pause, and doesn't time a moment or a short silence, so a beat is 1 second, a moment is taken as a pause, and a short silence is half a silence.
  - **Pages**: a minute a page of the PDF.
- A script report, opened with **Show script report** in a tab beside the script. It follows the script you're in and updates as you write. Click a character or scene to go there.
  - **Totals:** pages, runtime, words spoken, speeches, acts, scenes and characters.
  - **Characters:** each one's speeches, words, share of the dialogue, time speaking, number of scenes, and first and last scene.
  - **Scenes:** each one's act, pages, runtime, speeches, words and characters. Scenes are scene headings, and acts with no scenes in them. Sections never make a scene. Text before the first scene is a scene of its own.
  - **Who's in each scene:** a chart of characters against scenes. A character is in a scene if they speak there or are named in a stage direction or parenthetical.
  - **Doubling:** characters who never share a scene, so one actor could play both.

  The button at the top of the report, or **Save script report as a note**, saves it as a Markdown note beside the script (`Script - Report.md`), replacing an earlier one.
- Each script reopens where you left it.
- Frozen drafts. **Freeze draft**, from the command palette or a script's **More options** menu, saves a copy of the script as it is now in your drafts folder (`Drafts` unless you change it in Fountain Stage's settings), and moves the script on to the next draft. **Cut from this draft** moves text you take out into the draft's cuts file, and **Restore cut** puts it back. See [Drafts](#drafts) and [Cuts](#cuts).
- Scene commands: move a scene up or down (or drag it in the outline), split a scene at the cursor, merge one with the scene before, renumber scenes, and go to the next or previous scene, or the next or previous speech by the character you're in. See [Scenes](#scenes).
- A line bank beside each script, for lines you haven't found a place for yet. See [Line bank](#line-bank).
- Comparing drafts: a Changes tab of what's changed since a frozen draft, a tint on changed lines, and a frozen draft side by side with the script, scrolling with it. See [Changes since a draft](#changes-since-a-draft).
- Alternate lines: keep other versions of a speech in notes under it, and switch which is live. See [Alternate lines](#alternate-lines).
- Pass checklists: name a rewrite pass and tick scenes off in the outline, or let the scenes you change tick themselves. See [Passes](#passes).
- Checks on the draft: names written two ways, stage directions an actor can't play, overlap slashes with no one to come in, repeated phrases, scenes thick with pauses, each character's voice, filler words and a map of speech lengths, in a Checks tab and, if you like, underlined in the script. See [Checks](#checks).
- Rehearsal pages: lock a draft's page numbers for rehearsal, then issue only the pages that change, numbered to fit around the others (23A, 23B) and marked in the margin. See [Rehearsal pages](#rehearsal-pages).
- PDF export in stage-play house styles, ported from fountain2pdf:
  - **modern:** Dramatists Guild Modern Play Format
  - **apt:** Australian Plays Transform submission format
  - **samuel_french:** Samuel French / SFI submission format
- Your own styles, as JSON files in your vault that extend another style and change only what differs.
- Your own fonts, from font files in your vault.
- An export dialog to pick the style, add a watermark (such as DRAFT) across every page, and include notes and synopses. A `Style:` key on a script's title page picks its style to start with.
- Works on desktop and mobile.

## Drafts

A script's draft number is its title page's `Draft:` key. A script with no `Draft:` key is draft 1.

**Freeze draft** asks what the draft is for (you can leave it blank) and whether to export a PDF of it. Then, for draft 3 of a play called *Play*, frozen on 21 November 2026:

- A copy of the script goes in the drafts folder as `Play - Draft 03 - 2026-11-21.fountain`. Its title page says `Draft: 3` and `Draft date: 21 November 2026`, and what the draft is for goes in a `Draft notes:` key, which never prints.
- The script itself becomes `Draft: 4 (working)`, without a draft date. Undo puts it back.

A script with no title page gets one, with its file name as the title. Scripts in the drafts folder open read-only, in reading view. To change one, choose **Unfreeze** from its **More options** menu, or run **Unfreeze draft**. It stays editable until you close its tab.

The draft and its date print in the bottom right corner of the title page, so a PDF of the working script says "Draft 4 (working)". A style can put them bottom left or leave them off with `titlePage.draft`; APT leaves them off.

## Cuts

**Cut from this draft**, from the command palette or a script's **More options** menu, takes the selected text out of the script and keeps it in a cuts file for the current draft, in the drafts folder: `Play - Draft 04 - Cuts.fountain` for draft 4. It cuts exactly what's selected, so you can cut a phrase from a speech as well as whole scenes.

Each cut goes under a heading saying where it came from and when, such as `# 7. INT. KITCHEN, line 3 · 22 November 2026` for a cut that started three lines into the seventh scene heading. Cuts are kept in the order of where they came from in the play, not when you cut them, so a cut from the first scene comes before one from the last. You can add a label to the end of a heading, and notes of your own before the first cut. The headings are sections, so they never print, and the cuts file's outline lists its cuts.

Undo in the script puts the text back and takes the cut out of the cuts file again; redo cuts it again.

To put a cut back, open the cuts file, put the cursor in the cut, and run **Restore cut** (also in the cuts file's **More options** menu). It goes in at the cursor in the script, which needs to be open. Restoring takes the cut out of the cuts file, and undo in the script puts it back there.

A draft's cuts file can be edited until the draft is frozen. After that it's frozen with it: it opens read-only, and **Restore cut** copies cuts from it rather than taking them out. Reading view of a cuts file shows the cut headings, unlike other scripts, where sections are hidden.

A cut restored partway along a line goes in as it is, such as a phrase back in a speech. On a blank line, or at the start of a line of text, it goes in as a paragraph of its own, with blank lines around it.

## Scenes

A scene runs from its scene heading to the next scene heading or section. Acts are scene headings too (see the Features list), so a scene ends where the next act starts. Each of these is a command, and each is one step to undo.

- **Move scene up** and **Move scene down** move the scene the cursor is in past the scene, act or section next to it, with all its text. A scene at the top of an act moves up into the act before. In the outline, drag a scene and drop it above or below another heading to move it there, or right-click a scene (press and hold, on a phone) to move it up or down.
- **Split scene** starts a new scene at the cursor's line. It asks for the new scene's heading, suggesting the current one with its number one on (`.SCENE 3` in scene 2). A heading that doesn't start like `INT.` or `EXT.` gets a full stop to force it.
- **Merge with previous scene** takes out the heading of the scene the cursor is in, joining it to the scene before. A synopsis under the heading moves up to join the earlier scene's.
- **Renumber scenes** rewrites the numbers in scene headings so they count in order: `SCENE 3`, or `SCENE THREE` in words (kept in the case it was written), and any `#3#` scene number. Choose whether to count from 1 in each act or straight through the play; Fountain Stage remembers which. Acts aren't counted, and headings without a number count but aren't changed. You see every heading that will change before anything does.
- **Go to next scene** and **Go to previous scene** move the cursor to the next or previous scene heading, acts included.
- **Go to this character's next speech** and **Go to this character's previous speech**, with the cursor in a speech, go to the next or previous speech by the same character.

Scenes in the drafts folder can't be moved, split, merged or renumbered while they're frozen.

## Line bank

The line bank keeps lines you want to use but haven't placed yet. It's a file beside the script, named after the play's title (or the script's file name, if it has no title): `Play - Line bank.fountain`. It's made the first time you add to it.

- **Add to line bank** asks for the line, starting from any text selected in the script, and adds it to the end of the bank. The script isn't changed. Ctrl/Cmd+Enter adds it. An entry can be several lines, such as a cue and its speech.
- **Put in a line from the line bank** lists the bank's entries. Type to narrow them, and pick one to put it in at the cursor. It's taken out of the bank, and undo in the script puts it back. It goes in the way a restored cut does: as it is partway along a line, or as a paragraph of its own on a blank line. Like restoring a cut, it needs the script in editing view, so you can see where the cursor is.

The bank is an ordinary script, so you can also open it and edit it, or add lines on your phone. Entries are separated by blank lines.

## Changes since a draft

These compare a script with one of its frozen drafts: the latest, unless you choose another. A play's frozen drafts are the scripts in the drafts folder named for it, such as `Play - Draft 03 - 2026-11-21.fountain`. A frozen draft is compared with the drafts before it.

- **Show changes since a draft**, also in a script's **More options** menu, opens the Changes tab beside the script. It follows the script you're in and updates as you write. Choose the draft to compare with at the top, or compare two frozen drafts with each other.
  - **Totals:** the change in runtime and words spoken, and how many scenes were added, cut, moved and changed.
  - **Scenes:** every scene, in the script's order, with any cut scene where it used to be: whether it's the same, changed, added, cut or moved, the lines added and taken out, and the change in its runtime and words. Click a scene to go there, in the script or, for a cut scene, in the draft.
  - **Characters:** each one's words then and now, and the change in their speeches.
- **Tint changes since a draft**, also in a script's **More options** menu, tints lines that are new or changed since the draft, in Live Preview and reading view. It's off to start with, and stays as you leave it.
- **Show side by side with a draft**, also in a script's **More options** menu and at the top of the Changes tab, opens the draft in a pane to the left of the script. The two scroll together, keeping lines that match level. Open another frozen draft in that pane to compare with it instead. Closing either pane stops them scrolling together. Not on phones, which have no room for two panes.

Scenes are matched by their text, not their headings, so a scene keeps its match when it's renumbered or retitled, and a scene that's moved shows as moved. Title pages, blank lines and alternate lines aren't compared.

## Alternate lines

Keep other versions of a speech or a stage direction without cutting either. Each version is a note straight under the live one, which is the version that prints:

```
ANNA
Not before coffee. Never before coffee.
[[alt: I never read the news before coffee.]]
```

Notes never print, so the file stays ordinary Fountain, and a PDF shows only the live version, even with notes included. With the cursor in a speech (its cue or any of its lines), an action paragraph, or one of its alternates:

- **Keep as an alternate** saves a copy of the live version as an alternate, so you can rewrite the live one.
- **Switch to next alternate** makes the next alternate live, and the live version becomes the last alternate, so switching again and again goes round every version.
- **Choose an alternate** lists the alternates, to make one live.

An alternate is of the whole speech, so its notes go after the speech's last line: a note between a speech's lines would end the speech there. A speech with a note inside it can't be kept as an alternate.

## Passes

A pass is a run through the play with one thing in mind, such as a dialogue pass. **Start a pass** asks for its name, and adds a checklist of every scene to a Markdown note beside the script, `Play - Passes.md`, made the first time. Each pass is a heading in the note, and the last one is the current pass.

The script outline shows the current pass at the top, with how many scenes are done, and a tick box beside each scene. Tick scenes there or in the note. A scene you change during the pass, so that it differs from the latest frozen draft, ticks itself. Scenes that already differed when the pass started don't, and neither does a scene you've unticked. A scene written since the pass started is added to its list when it's ticked. **Open passes** opens the note.

## Checks

**Show checks**, also in a script's **More options** menu, opens the Checks tab beside the script. It follows the script you're in and updates as you write. Each finding links to its line. The checks point at things to look at, not mistakes, so dismiss any you're happy with: the button beside it hides it until the text it's about changes. **Show dismissed** at the top shows them again, faintly, to bring one back.

- **Names:** two cue names that may be one character, because they're written two ways (`DR. JONES` and `DR JONES`), spelt nearly the same (`CAROLINE` and `CAROLYNE`), one is part of the other (`MRS PIKE` and `PIKE`), or one is a short form of the other (`MAGGIE` and `MARGARET`). With a Characters list on the title page or a cast list section, also characters in the list who never speak, and speakers missing from it. A one-line list such as `Characters: ANNA, TOM and MRS PIKE` counts each name.
- **Stage directions:** what an actor can't play ("realises", "remembers", "wonders"), screen language ("we see", "camera", "cut to"), your own phrases from settings, and stage directions of more than 60 words.
- **Overlaps:** a speech with an overlap slash (`/`, where the next speaker comes in) that no speech follows. Overlap slashes in dialogue always show in the accent colour.
- **Repeated phrases:** phrases of three words or more that come three times or more, in dialogue and stage directions, with each place they come.
- **Pauses:** scenes with at least four pauses, and twice the play's rate of them or more. Pauses are the pause words in settings.
- **Voices:** for each character with five speeches or more, how long they typically speak and their longest speech, words only they use, phrases they come back to, and the character whose words are most like theirs.
- **Filler words:** how often the dialogue says just, really, actually, honestly, you know and the like, and who says each most.
- **Speech lengths:** a bar for every speech, through the play from left to right by running time, with a dashed line at 150 words (about a minute). Monologues that reach it stand out. Hover a bar for whose speech it is, and click it to go there. A table lists the ten longest.

**Mark check findings**, the toggle at the top of the tab, or **Mark findings in the editor** in Fountain Stage's settings, underlines what the checks find in the script, such as a phrase in a stage direction. Hover a mark to see why. It's off to start with. In settings, **Phrases to check in stage directions** takes your own phrases, one a line, and **Dismissed findings** brings back every dismissed finding at once.

## Rehearsal pages

Once a script goes into rehearsal, everyone's copy needs the same page numbers. Lock a draft, and later changes come out as revised pages to slot into those copies, rather than a new script.

- **Lock rehearsal script**, from the command palette or a script's **More options** menu, makes the latest frozen draft the rehearsal script (freeze one first). Its title page gets `Locked:` and the date, and a `Style:` key if it had none, since its pages are fixed in that style. Neither prints. Locking another draft later moves the lock, and revisions start again at Rev. 1. Run it from a frozen draft's menu to lock that draft.
- While a script is locked, its page breaks in the editor are the locked pages: the working script shows "Page 23A" where new text has run onto extra pages since.
- **Issue revised pages** compares the working script with the rehearsal pages as they stand after any earlier revisions, and lists the pages that changed. Issuing them saves a PDF of just those pages beside the script (`Play - Rev. 1.pdf`), and freezes the script as a draft with `Revision: 1` on its title page, so the next revision compares with this one.
- **Unlock rehearsal script** takes the lock off. Page breaks follow the text again. Revisions already issued stay in their frozen drafts.

How revised pages are numbered:

- A page with changes keeps its number, and is laid out again from its own first line to the next unchanged page's.
- Text that no longer fits runs onto new pages after it: 23A, then 23B. A page added after 23A is 23AA, if 23B is taken.
- A page that loses all its text is joined to the page before, numbered for both: 23–24.
- Every other page keeps its number and its text, so nothing after a change moves.
- Text moved from one part of the play to another counts as new where it lands.

Each revised page has a header, "Rev. 1 · 22 November 2026", and an asterisk in the right margin beside every line of a changed speech or stage direction, and beside the line after a cut. The style's `revision` settings change the header, the mark and where they go (see [Styles of your own](#styles-of-your-own)).

The title page and anything before the first page of the play aren't revised. Locked pages are worked out again from the locked draft each time, so changing the style or fonts it uses moves its page breaks: leave them alone while it's locked. Changes are matched scene by scene, so cutting or merging a scene heading can mark more pages than it might.

## Exporting to PDF

Run **Export to PDF** from the command palette, a script's file menu, or the button at the top of an open script. A dialog asks for:

- **Style:** the house style. Page size and margins are part of the style: Modern Play Format and Samuel French are US Letter, APT is A4. For another size, make a style of your own (below) with `"page": { "size": "A4" }`.
- **Watermark:** text printed faintly and diagonally across every page, such as DRAFT or a theatre's name. Leave it blank for none.
- **Include notes:** prints `[[notes]]` in grey italics in square brackets, where they're written. A note on a line of its own prints as a line of its own.
- **Include synopses:** prints `= synopsis` lines in grey italics, where they're written.

The dialog remembers your choices for next time. The PDF is saved next to the script with the same name, replacing any earlier export, and opens in a new tab.

To give a script a style, add a `Style:` line to its title page. It's never printed.

```
Title: The Last Rehearsal
Author: Tim
Style: apt
```

The dialog then starts in that style. Without one, it starts in the style you used last.

### Styles of your own

A style of your own is a `.json` file in your styles folder (`Fountain Stage/Styles` unless you change it in Fountain Stage's settings). It names the style it starts from with `extends`, then changes only what differs:

```json
{
  "extends": "apt",
  "name": "Festival submission",
  "character": { "bold": true },
  "page": { "margins": { "top": "30mm" } },
  "action": { "italic": false, "color": "#000000" }
}
```

- `extends` names a built-in style (`modern`, `apt`, `samuel_french`) or another of your own.
- The style's id, for `Style:` keys, is the file name (`Festival.json` is `Style: Festival`) unless you give an `"id"`. Ids ignore case, spaces, hyphens and underscores. `Style:` also finds a style by its name.
- `name` and `description` are shown in the export dialog.
- Lengths are points, or text with a unit: `"25mm"`, `"2.5cm"`, `"1in"`, `"12pt"`.
- Colours are `"#rrggbb"` or `[red, green, blue]` from 0 to 1.
- Keys starting with `_` are ignored, so `"_note": "…"` works as a comment.

If a file has a problem, such as a misspelt setting or a value of the wrong kind, the style is left out of the export dialog. Fountain Stage's settings list each problem with the setting and the reason. Obsidian can't edit `.json` files itself, so use another text editor. To see them in Obsidian's file list, turn on **Settings → Files and links → Detect all file extensions**.

Every setting:

| Group | Settings |
|---|---|
| `page` | `size` (`"A4"`, `"A5"`, `"letter"`, `"legal"`), `width`, `height`, `margins` (`top`, `right`, `bottom`, `left`) |
| `fonts` | `family`: a font family name, or a list tried in order; `fallback`: `"times"`, `"helvetica"` or `"courier"` |
| `text` | `size`, `leading` (baseline to baseline) |
| `titlePage` | `titleSize`, `bylineSize`, `draft` (where the draft number and date print: `"right"` or `"left"` bottom corner, or `"hide"`) |
| `character` | `size`, `bold`, `ownLine` (name above the speech, or beside its first line), `alignment`, `shortParentheticalInline` ("JOHN (laughing)"), `nameColumnWidth` and `gutter` (when beside) |
| `speech` | `gap` (between speeches), `moreContinued` (mark speeches that break across a page), `moreText`, `continuedText`, `dualLabel` (added to both names of dual dialogue) |
| `parenthetical` | `italic`, `indent` |
| `action` | `size`, `italic`, `alignment`, `leftIndent`, `rightIndent`, `color` |
| `act` | `size`, `bold`, `italic`, `underline`, `alignment`, `pattern` (a regular expression; scene headings it matches, ignoring case, are acts; default `"^ACT\\b"`), `newPage` (start each act on a new page) |
| `scene` | `size`, `bold`, `italic`, `underline`, `alignment` |
| `sceneNumbers` | `position` (`"hide"`, `"before"`, `"after"`), `format` (`{n}` is the number), `inHeader` |
| `header` | `strap` (running "PLAY TITLE \| SCENE" header) |
| `pagination` | `fromBody`, `prefaceRoman`, `face` (`"regular"`, `"bold"`, `"italic"`, `"boldItalic"`), `size`, `format`, `position` (`"top"`, `"bottom"`), `alignment` |
| `prelims` | `headingBold`, `headingUnderline`, `nameUnderline` |
| `notes` | `italic`, `color` (for notes, when an export includes them) |
| `synopses` | `italic`, `color` (for synopses, when an export includes them) |
| `watermark` | `face`, `color`, `opacity` (0 to 1), `angle` (degrees, -90 to 90), `maxSize` (longer text is set smaller to fit the page) |
| `revision` | For revised pages: `format` of the header (`{n}` is the revision number, `{date}` its date; default `"Rev. {n} · {date}"`), `face`, `size`, `position` (`"top"`, `"bottom"`), `alignment`, `mark` (printed in the right margin beside each changed line, and after a cut; default `"*"`), `markGap` (how far into the margin the mark goes) |

Alignments are `"left"`, `"center"` or `"right"`. The built-in styles in [src/pdf/styles](src/pdf/styles) show every setting in use.

### Fonts

PDFs use Times unless a style names a font family and your fonts folder (`Fountain Stage/Fonts` unless you change it) has it. APT asks for Palatino. Put the font's `.ttf` or `.otf` files in the folder: Fountain Stage reads each file's own family name, weight and style, so file names don't matter. A family name also finds families it starts, so `Palatino` finds Palatino Linotype. If the family is missing, the PDF uses the style's fallback font and a notice says so. Font collections (`.ttc`) can't be used.

## Install

Fountain Stage needs Obsidian 1.13 or later, on desktop or mobile.

1. In Obsidian, open **Settings → Community plugins**, and turn on community plugins if asked.
2. Choose **Browse**, search for **Fountain Stage**, and choose **Install**.
3. Choose **Enable**.

Or open its page in the [community plugin directory](https://community.obsidian.md/plugins/fountain-stage). Obsidian offers updates in **Settings → Community plugins**.

**By hand:** from the [latest release](https://github.com/timothydsmith/obsidian-fountain-stage/releases/latest), download `main.js`, `manifest.json` and `styles.css`, and put them in a folder called `fountain-stage` inside your vault's plugins folder: `<vault>/.obsidian/plugins/fountain-stage/`. The `.obsidian` folder is hidden on some systems. Restart Obsidian, then turn on **Fountain Stage** in **Settings → Community plugins**.

Only one plugin can open `.fountain` files at a time. If another Fountain plugin, such as **Fountain**, is on in a vault, turn it off there before turning on Fountain Stage.

## Development

Needs Node.js 22.12 or later.

```sh
npm install
npm run dev    # watch build
npm test       # vitest
npm run build  # type-check and production build
```

To copy every build straight into a test vault, create a `.env` file in the project folder (it's ignored by git):

```
OBSIDIAN_VAULT=C:\path\to\test vault
```

Each build is then copied to `<vault>/.obsidian/plugins/fountain-stage/`, along with a `.hotreload` marker file. With the [Hot Reload](https://github.com/pjeby/hot-reload) plugin installed in the test vault, Obsidian loads each new build by itself. Without it, turn Fountain Stage off and on again after each build. Hot Reload ignores plugins that don't have the marker, so an old build keeps running until you reload.

Layout:

| Path | Purpose |
|---|---|
| `src/main.ts` | Plugin entry point: registers the view, commands and ribbon button |
| `src/editor/FountainView.ts` | The `.fountain` editor (CodeMirror 6) |
| `src/editor/formatting.ts` | Formatting as you type: re-parses on each change and styles each line |
| `src/editor/reading.ts`, `src/fountain/reading.ts` | Reading view: what it hides, and hiding it |
| `src/editor/completion.ts`, `src/fountain/characters.ts` | Character name completion, and finding the names |
| `src/editor/cycling.ts`, `src/fountain/lineTypes.ts` | Tab and Shift+Tab: what they do to a line, and the keys |
| `src/outlineView.ts`, `src/fountain/outline.ts` | The script outline sidebar, and building the outline |
| `src/pagination.ts`, `src/pdf/pageBreaks.ts`, `src/editor/pageRules.ts` | Page breaks in the editor: laying the script out in its style and fonts, where pages break, and the rules |
| `src/fountain/runtime.ts` | The runtime estimate, from words spoken or pages |
| `src/reportView.ts`, `src/fountain/report.ts`, `src/fountain/reportMarkdown.ts` | The script report: the tab, working out the report, and the Markdown note |
| `src/fountain/rename.ts`, `src/renameCharacterModal.ts` | Renaming a character: finding every place to change, and the dialog |
| `src/fountain/titlePage.ts`, `src/freezeDraft.ts` | Freezing drafts: reading and rewriting title-page keys, and the freeze dialog |
| `src/fountain/cuts.ts`, `src/cutsCommands.ts`, `src/editor/cutHistory.ts` | Cuts: the cuts file's format and order, the commands, and keeping the cuts file (and line bank) in step with undo |
| `src/fountain/lineBank.ts`, `src/lineBankCommands.ts` | The line bank: its format, and adding and putting in lines |
| `src/fountain/insert.ts` | Putting text in at the cursor as a phrase or a paragraph, for restored cuts and the line bank |
| `src/fountain/scenes.ts`, `src/sceneCommands.ts` | Scenes: moving, splitting, merging and renumbering them, the jump commands, and their dialogs |
| `src/fountain/compare.ts`, `src/changes.ts`, `src/changesView.ts` | Changes since a draft: matching scenes and lines, finding and reading a play's drafts, and the Changes tab |
| `src/editor/changeTint.ts`, `src/sideBySide.ts` | The tint on changed lines, and scrolling a draft side by side with the script |
| `src/fountain/alternates.ts`, `src/alternateCommands.ts` | Alternate lines: finding a speech's alternates and switching them, and the commands |
| `src/fountain/passes.ts`, `src/passes.ts` | Pass checklists: the passes note's format, and ticking scenes from the outline and as they change |
| `src/fountain/checks/`, `src/checks.ts`, `src/checksView.ts`, `src/editor/checkMarks.ts` | Checks: each check, running them and remembering dismissed findings, the Checks tab, and the marks in the editor |
| `src/fountain/pauses.ts`, `src/pauseWordsModal.ts` | Pause words: finding them in a script and timing them, and the settings page for them |
| `src/fountain/parser.ts` | Fountain parser, ported from fountain2pdf, with source positions |
| `src/fountain/inline.ts` | Inline emphasis and links |
| `src/pdf/revisions.ts`, `src/rehearsal.ts` | Rehearsal pages: the locked pages and laying out revised pages, and locking, unlocking and issuing in Obsidian |
| `src/export.ts` | Export to PDF in Obsidian: the export dialog and saving the PDF |
| `src/pdf/style.ts` | The `PlayStyle` type: every setting a house style controls |
| `src/pdf/styles/` | The built-in styles |
| `src/pdf/layout.ts` | Turns a parsed script into pages, ported from fountain2pdf's engine |
| `src/pdf/paragraph.ts`, `blocks.ts`, `flow.ts` | Line breaking and pagination, matching reportlab's so pages break where fountain2pdf's did |
| `src/library.ts` | Plugin settings, and loading styles and fonts from the vault folders |
| `src/settings.ts` | The settings tab |
| `src/pdf/userStyles.ts` | Style files of your own: the schema of every setting, validation and `extends` |
| `src/pdf/vaultFonts.ts` | Reading font files and choosing a family's faces |
| `src/pdf/fonts.ts`, `render.ts` | Font metrics, and drawing the pages with pdf-lib |
| `src/files.ts` | File helpers, such as picking a name for a new script |
| `src/obsidianConfig.ts` | Reads Obsidian's editor settings, such as **Show line number** |
| `tests/` | vitest tests |

## Branches and releases

- **`dev`** is where work happens. Commit or merge feature branches here.
- **`main`** holds released versions only. Every commit on `main` is a release.

To cut a release:
1. On `dev`, move the **Unreleased** entries in [CHANGELOG.md](CHANGELOG.md) under a new version heading with today's date.
2. Bump `version` in `manifest.json` and `package.json`. Add the version to `versions.json`, mapped to `minAppVersion`.
3. Run `npm test` and `npm run build`, then commit.
4. Merge `dev` into `main`, and tag the merge with the bare version, e.g. `0.1.0`. Obsidian requires the tag to match `manifest.json` exactly, with no `v` prefix.
5. Push `main` and the tag. The **Release** workflow then builds the plugin from the tag, attests the provenance of `main.js`, `manifest.json` and `styles.css`, and publishes the GitHub release with them attached and that version's changelog section as its notes. It stops if the tag doesn't match `manifest.json` or the changelog has no section for it.

## License

[MIT](LICENSE)
