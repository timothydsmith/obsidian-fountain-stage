---
title: "Linked notes"
description: "Links from a script to notes in your vault, and appending them to the PDF."
---

Link a script to notes in your vault, such as research, a props list or a character study, with `[[>Note]]`, or `[[>Note|display text]]` to show other words. It's the syntax of the [Fountain plugin](https://github.com/bgrundmann/obsidian-fountain), so scripts move between the two unchanged. The note is found as Obsidian finds a link's: by name or by path (`[[>Research/Ibsen]]`), with or without `.md`. Links can go anywhere: in a stage direction, on a line of their own, or in dialogue.

- **Writing a link:** after `[[>`, Fountain Stage offers the vault's note names. Enter or Tab picks one and closes the link.
- **Opening a note:** in reading view, click a link; while editing, Ctrl-click (Cmd-click on a Mac). Ctrl/Cmd-click opens it in a new tab.
- **Previewing a note:** hover over a link for Obsidian's page preview: in reading view straight away, and while editing with Ctrl or Cmd held. Change this under **Page preview** in Obsidian's core plugin settings.
- **Missing notes:** a link to a note that isn't there looks like Obsidian's own unresolved links.
- **Renaming a note:** Fountain Stage changes every link to it in your scripts, keeping the way each was written: a link by name gets the new name, and a link by path the new path. A script that's open changes as one step to undo. Frozen drafts are left as they were. As for notes, Obsidian's **Automatically update internal links** setting (under **Files and links**) decides: on, links are updated straight away; off, Fountain Stage first asks whether to update the links in your scripts. Obsidian may ask too, about links in your notes.
- **Reading view** shows a link's display text, or the note's name.
- **In the PDF**, links are notes: they print only with **Include notes** on, as their display text or the note's name.

## Appending linked notes to the PDF

With **Append linked notes** on in the export dialog, each note the script links to is added after the script, under its title, on a page of its own. Each note comes once, in the order the script first links to it. Notes are laid out in the script's font:

- headings, paragraphs (each line a line, as in Obsidian), bold and italic, and web links;
- lists, nested, numbered and checklists;
- block quotes and callouts, rules, tables and code blocks;
- PNG and JPEG pictures (`![[plan.png]]`, `![[plan.png|300]]` for 300 pixels wide, or `![alt](plan.png)`), no wider than the page; other pictures print as their name;
- notes embedded on a line of their own (`![[Other note]]`, or `![[Other note#Heading]]` for one section), written in where they're embedded. Notes embedded in an embedded note aren't followed, and print as their name.

Frontmatter and `%%comments%%` are left out, and links to other notes print as their text. A style's `appendix` settings change the titles and whether each note starts a page.

A frozen draft appends the notes as they were when it was frozen, from the `- Linked notes.md` note beside it, so its PDF can be made again as it was. Each note is under a heading of its own there. A draft frozen before Fountain Stage kept these appends the notes as they are now.
