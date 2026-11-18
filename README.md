# Fountain Stage

An [Obsidian](https://obsidian.md) plugin for writing scripts in [Fountain](https://fountain.io/syntax/), with formatting as you type, line numbers, and export to stage-play PDFs in a choice of house styles.

> **Status:** first release, 0.1.0. It's not in Obsidian's community plugin directory yet: see [Install](#install).

Line numbers and line width follow Obsidian's own **Settings → Editor → Show line number** and **Readable line length**, so scripts and notes match.

## Features

- Formatting as you type, following the Fountain spec.
- Line numbers for every line of the file, shown in the editor when Obsidian's **Show line number** setting is on.
- Live Preview, source mode and reading view, as for notes. Scripts open in the mode set by Obsidian's **Default view for new tabs** and **Default editing mode** settings. Switch with the button at the top of a script, its **More options** menu, or the same hotkeys as notes (Ctrl/Cmd+E for reading view).
  - **Live Preview** formats the script as you type, with the markup shown faintly.
  - **Source mode** is the plain text, unformatted.
  - **Reading view** shows the formatted script without its markup, notes, synopses or boneyard, and can't be edited.
- Character names complete as you type. Type two capital letters in a row anywhere in a line, in a cue or a stage direction, and Fountain Stage offers the names that start that way: from the script's cues (most lines first) and its Characters list. Enter or Tab picks one; Escape closes the list. Names of several words work too (`MRS SM` offers MRS SMITH).
- Tab sets what a line is:
  - On an empty line after a blank line, where you'd start a stage direction, Tab lists the script's character names. Type to narrow the list, then Tab or Enter to pick a name.
  - On a line of text, Tab changes it from action to character to scene heading to transition and back to action, and Shift+Tab goes the other way. The line is changed from how it was before your first Tab, so going round gives it back, and a forcing mark (`!`, `@`, `.`, `>`) is only added where the text needs it.
  - In a speech, Tab switches a line between dialogue and parenthetical, and on an empty line under a cue or dialogue, starts a parenthetical.
  - **Next line type** and **Previous line type** do the same, for the mobile toolbar.
- **Rename character**, from the command palette or a script's **More options** menu, renames a character throughout the script: its cues, its Characters list entry, and its name in stage directions, headings, notes and dialogue. Each is written in the case the old name was, so MARGARET becomes JANE and Margaret's becomes Jane's. A name all in lower case is left alone, so renaming WILL doesn't touch "will". The character is the one at the cursor, or one you choose. Before anything changes you see how many places of each kind will change, and where, and can leave any kind out. It's one step to undo.
- The status bar shows what the line you're on is: Character, Dialogue, Stage direction, Scene heading and so on, as Fountain Stage reads it. A cue with no dialogue under it yet reads as a stage direction.
- A script outline in the sidebar, since Obsidian's own outline only reads notes. It lists the script's acts (`#`), scenes (`##`) and scene headings, nested, with any synopsis (`= …`) under its heading and how long each runs. Click one to go there. The part you're in is highlighted, and the outline updates as you type. Open it with **Show script outline**.
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
  - **Scenes:** each one's act, pages, runtime, speeches, words and characters. Scenes are the smallest parts of the outline: scene headings, or `##` scenes where there are none. Text before the first heading is a scene of its own.
  - **Who's in each scene:** a chart of characters against scenes. A character is in a scene if they speak there or are named in a stage direction or parenthetical.
  - **Doubling:** characters who never share a scene, so one actor could play both.

  The button at the top of the report, or **Save script report as a note**, saves it as a Markdown note beside the script (`Script - Report.md`), replacing an earlier one.
- Each script reopens where you left it.
- PDF export in stage-play house styles, ported from fountain2pdf:
  - **modern:** Dramatists Guild Modern Play Format
  - **apt:** Australian Plays Transform submission format
  - **samuel_french:** Samuel French / SFI submission format
- Your own styles, as JSON files in your vault that extend another style and change only what differs.
- Your own fonts, from font files in your vault.
- An export dialog to pick the style, add a watermark (such as DRAFT) across every page, and include notes and synopses. A `Style:` key on a script's title page picks its style to start with.
- Works on desktop and mobile.

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
| `titlePage` | `titleSize`, `bylineSize` |
| `character` | `size`, `bold`, `ownLine` (name above the speech, or beside its first line), `alignment`, `shortParentheticalInline` ("JOHN (laughing)"), `nameColumnWidth` and `gutter` (when beside) |
| `speech` | `gap` (between speeches), `moreContinued` (mark speeches that break across a page), `moreText`, `continuedText`, `dualLabel` (added to both names of dual dialogue) |
| `parenthetical` | `italic`, `indent` |
| `action` | `size`, `italic`, `alignment`, `leftIndent`, `rightIndent`, `color` |
| `act` | `size`, `bold`, `italic`, `underline`, `alignment` |
| `scene` | `size`, `bold`, `italic`, `underline`, `alignment`, `uppercaseSections` |
| `sceneNumbers` | `position` (`"hide"`, `"before"`, `"after"`), `format` (`{n}` is the number), `inHeader` |
| `header` | `strap` (running "PLAY TITLE \| SCENE" header) |
| `pagination` | `fromBody`, `prefaceRoman`, `face` (`"regular"`, `"bold"`, `"italic"`, `"boldItalic"`), `size`, `format`, `position` (`"top"`, `"bottom"`), `alignment` |
| `prelims` | `headingBold`, `headingUnderline`, `nameUnderline` |
| `notes` | `italic`, `color` (for notes, when an export includes them) |
| `synopses` | `italic`, `color` (for synopses, when an export includes them) |
| `watermark` | `face`, `color`, `opacity` (0 to 1), `angle` (degrees, -90 to 90), `maxSize` (longer text is set smaller to fit the page) |

Alignments are `"left"`, `"center"` or `"right"`. The built-in styles in [src/pdf/styles](src/pdf/styles) show every setting in use.

### Fonts

PDFs use Times unless a style names a font family and your fonts folder (`Fountain Stage/Fonts` unless you change it) has it. APT asks for Palatino. Put the font's `.ttf` or `.otf` files in the folder: Fountain Stage reads each file's own family name, weight and style, so file names don't matter. A family name also finds families it starts, so `Palatino` finds Palatino Linotype. If the family is missing, the PDF uses the style's fallback font and a notice says so. Font collections (`.ttc`) can't be used.

## Install

Fountain Stage isn't in Obsidian's community plugin directory yet. Install it from its GitHub releases, by hand or with BRAT. It needs Obsidian 1.8.7 or later, on desktop or mobile.

**By hand:**
1. From the [latest release](https://github.com/timothydsmith/obsidian-fountain-stage/releases/latest), download `main.js`, `manifest.json` and `styles.css`.
2. Put them in a folder called `fountain-stage` inside your vault's plugins folder: `<vault>/.obsidian/plugins/fountain-stage/`. The `.obsidian` folder is hidden on some systems.
3. Restart Obsidian, then turn on **Fountain Stage** in **Settings → Community plugins**.

To update, replace the three files with those from a newer release.

**With BRAT:** install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) community plugin, choose **Add beta plugin**, and enter `timothydsmith/obsidian-fountain-stage`. BRAT installs the latest release and keeps it up to date.

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
| `src/fountain/pauses.ts`, `src/pauseWordsModal.ts` | Pause words: finding them in a script and timing them, and the settings page for them |
| `src/fountain/parser.ts` | Fountain parser, ported from fountain2pdf, with source positions |
| `src/fountain/inline.ts` | Inline emphasis and links |
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
5. Push `main` and the tag. Then create a GitHub release for that tag, with that version's changelog section as its notes and `main.js`, `manifest.json` and `styles.css` attached.

## License

[MIT](LICENSE)
