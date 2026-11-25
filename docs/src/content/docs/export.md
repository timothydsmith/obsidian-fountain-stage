---
title: "Exporting to PDF"
description: "Exporting a script to PDF: the export dialog, house styles and the Style key."
---

Run **Export to PDF** from the command palette, a script's file menu, or the button at the top of an open script. A dialog asks for:

- **Style:** the house style. Page size and margins are part of the style: Modern Play Format and Samuel French are US Letter, APT is A4. For another size, make a style of your own (below) with `"page": { "size": "A4" }`.
- **Watermark:** text printed faintly and diagonally across every page, such as DRAFT or a theatre's name. Leave it blank for none.
- **Include notes:** prints `[[notes]]` in grey italics in square brackets, where they're written. A note on a line of its own prints as a line of its own. A link to a note prints as its display text (or the note's name), without brackets.
- **Include synopses:** prints `= synopsis` lines in grey italics, where they're written.
- **Append linked notes:** adds the notes the script links to after it. Shown only for a script with links. See [Linked notes](../linked-notes/).

The dialog remembers your choices for next time. The PDF is saved next to the script with the same name, replacing any earlier export, and opens in a new tab.

To give a script a style, add a `Style:` line to its title page. It's never printed. Nor is a `Framework:` line, which names the framework the beat map marks.

```
Title: The Last Rehearsal
Author: Tim
Style: apt
```

The dialog then starts in that style. Without one, it starts in the style you used last.

To change a style, or make one of your own, see [Styles of your own](../styles/). To print in your own fonts, see [Fonts](../fonts/).
