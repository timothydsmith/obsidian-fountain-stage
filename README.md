# Playwright

An [Obsidian](https://obsidian.md) plugin for writing scripts in [Fountain](https://fountain.io/syntax/), with formatting as you type, line numbers, and export to stage-play PDFs in a choice of house styles.

> **Status:** early development. Nothing is released yet, but everything planned for the first release is in place: formatting as you type, line numbers, and PDF export in built-in or your own styles, with your own fonts.

Line numbers and line width follow Obsidian's own **Settings → Editor → Show line number** and **Readable line length**, so scripts and notes match.

## Features

- Formatting as you type, following the Fountain spec.
- Line numbers for every line of the file, shown in the editor when Obsidian's **Show line number** setting is on.
- Live Preview, source mode and reading view, as for notes. Scripts open in the mode set by Obsidian's **Default view for new tabs** and **Default editing mode** settings. Switch with the button at the top of a script, its **More options** menu, or the same hotkeys as notes (Ctrl/Cmd+E for reading view).
  - **Live Preview** formats the script as you type, with the markup shown faintly.
  - **Source mode** is the plain text, unformatted.
  - **Reading view** shows the formatted script without its markup, notes, synopses or boneyard, and can't be edited.
- Character names complete as you type. Type two capital letters in a row anywhere in a line, in a cue or a stage direction, and Playwright offers the names that start that way: from the script's cues (most lines first) and its Characters list. Enter or Tab picks one; Escape closes the list. Names of several words work too (`MRS SM` offers MRS SMITH).
- Tab sets what a line is:
  - On an empty line after a blank line, where you'd start a stage direction, Tab lists the script's character names. Type to narrow the list, then Tab or Enter to pick a name.
  - On a line of text, Tab changes it from action to character to scene heading to transition and back to action, and Shift+Tab goes the other way. The line is changed from how it was before your first Tab, so going round gives it back, and a forcing mark (`!`, `@`, `.`, `>`) is only added where the text needs it.
  - In a speech, Tab switches a line between dialogue and parenthetical, and on an empty line under a cue or dialogue, starts a parenthetical.
  - **Next line type** and **Previous line type** do the same, for the mobile toolbar.
- The status bar shows what the line you're on is: Character, Dialogue, Stage direction, Scene heading and so on, as Playwright reads it. A cue with no dialogue under it yet reads as a stage direction.
- A script outline in the sidebar, since Obsidian's own outline only reads notes. It lists the script's acts (`#`), scenes (`##`) and scene headings, nested, with any synopsis (`= …`) under its heading and how long each runs. Click one to go there. The part you're in is highlighted, and the outline updates as you type. Open it with **Show script outline**.
- Page breaks: a rule across the script where each page of its PDF starts, labelled with the page's number, in Live Preview and reading view. Pages break as they would in the style the script's `Style:` key names (otherwise the **Style for page breaks** setting), with the same fonts. They catch up a moment after you stop typing. A page that starts partway through a long paragraph gets its rule after the paragraph, saying so. The status bar shows the page you're on and the page count.
- A runtime estimate, in the status bar for the whole script and in the outline for each act and scene. It goes by one of two methods, set in Playwright's settings:
  - **Words spoken** (the default): dialogue at 150 words a minute, stage directions at half that, and the pauses the script asks for. A pause word (beat, moment, pause, silence) counts in any parenthetical, and in a stage direction where it stands on its own, as in "Beat.", "A long silence." or "After a pause, she sits", but not "A moment later". Each pause word has its own time, a short time (after short, brief, slight, tiny, little or quick) and a long time (after long, longer, lengthy, extended, endless or interminable). A number multiplies it, so "two beats" is twice a beat, and plurals count too. Change the times, or add words and phrases of your own (such as "lights fade"), under **Pause words** in Playwright's settings.

    | Word | Seconds | Short | Long |
    |---|---|---|---|
    | beat | 1 | 0.5 | 2 |
    | moment | 2 | 1 | 4 |
    | pause | 2 | 1 | 4 |
    | silence | 5 | 2.5 | 7 |

    The times for pause and silence follow the Author's Note to Annie Baker's *Circle Mirror Transformation*. Baker calls a beat less than a pause, and doesn't time a moment or a short silence, so a beat is 1 second, a moment is taken as a pause, and a short silence is half a silence.
  - **Pages**: a minute a page of the PDF.
- Each script reopens where you left it.
- PDF export in stage-play house styles, ported from fountain2pdf:
  - **modern:** Dramatists Guild Modern Play Format
  - **apt:** Australian Plays Transform submission format
  - **samuel_french:** Samuel French / SFI submission format
- Your own styles, as JSON files in your vault that extend another style and change only what differs.
- Your own fonts, from font files in your vault.
- A `Style:` key on a script's title page that picks its export style. Without one, you pick a style when you export.
- Works on desktop and mobile.

## Exporting to PDF

Run **Export to PDF** from the command palette, a script's file menu, or the button at the top of an open script. The PDF is saved next to the script with the same name, and opens in a new tab.

To give a script a style, add a `Style:` line to its title page. It's never printed.

```
Title: The Last Rehearsal
Author: Tim
Style: apt
```

Without one, Playwright asks which style to use. **Export to PDF in a chosen style** always asks.

### Styles of your own

A style of your own is a `.json` file in your styles folder (`Playwright/Styles` unless you change it in Playwright's settings). It names the style it starts from with `extends`, then changes only what differs:

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
- `name` and `description` are shown in the style picker.
- Lengths are points, or text with a unit: `"25mm"`, `"2.5cm"`, `"1in"`, `"12pt"`.
- Colours are `"#rrggbb"` or `[red, green, blue]` from 0 to 1.
- Keys starting with `_` are ignored, so `"_note": "…"` works as a comment.

If a file has a problem, such as a misspelt setting or a value of the wrong kind, the style is left out of the picker. Playwright's settings list each problem with the setting and the reason. Obsidian can't edit `.json` files itself, so use another text editor. To see them in Obsidian's file list, turn on **Settings → Files and links → Detect all file extensions**.

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

Alignments are `"left"`, `"center"` or `"right"`. The built-in styles in [src/pdf/styles](src/pdf/styles) show every setting in use.

### Fonts

PDFs use Times unless a style names a font family and your fonts folder (`Playwright/Fonts` unless you change it) has it. APT asks for Palatino. Put the font's `.ttf` or `.otf` files in the folder: Playwright reads each file's own family name, weight and style, so file names don't matter. A family name also finds families it starts, so `Palatino` finds Palatino Linotype. If the family is missing, the PDF uses the style's fallback font and a notice says so. Font collections (`.ttc`) can't be used.

## Install

Not released yet. To try a development build, see [Development](#development).

Playwright and the **Fountain** community plugin both open `.fountain` files, and only one plugin can do that at a time. Turn **Fountain** off in any vault where you use Playwright.

## Development

Needs Node.js 18 or later.

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

Each build is then copied to `<vault>/.obsidian/plugins/playwright/`, along with a `.hotreload` marker file. With the [Hot Reload](https://github.com/pjeby/hot-reload) plugin installed in the test vault, Obsidian loads each new build by itself. Without it, turn Playwright off and on again after each build. Hot Reload ignores plugins that don't have the marker, so an old build keeps running until you reload.

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
| `src/fountain/pauses.ts`, `src/pauseWordsModal.ts` | Pause words: finding them in a script and timing them, and the settings page for them |
| `src/fountain/parser.ts` | Fountain parser, ported from fountain2pdf, with source positions |
| `src/fountain/inline.ts` | Inline emphasis and links |
| `src/export.ts` | Export to PDF in Obsidian: style picker and saving the PDF |
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
