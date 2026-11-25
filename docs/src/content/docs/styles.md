---
title: "Styles of your own"
description: "House styles of your own, as JSON files that extend a built-in style."
---

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
| `appendix` | For linked notes appended after the script: `titleSize` (each note's title; its own headings run from the body size plus 4 down to the body size; default 16), `titleBold`, `titleAlignment`, `pagePerNote` (start each note on a new page; default `true`) |

Alignments are `"left"`, `"center"` or `"right"`. The built-in styles in [src/pdf/styles](https://github.com/timothydsmith/obsidian-fountain-stage/tree/main/src/pdf/styles) show every setting in use.
