---
title: "Frozen drafts"
description: "Freezing a draft: a read-only copy of the script, with its draft number and date."
---

A script's draft number is its title page's `Draft:` key. A script with no `Draft:` key is draft 1.

**Freeze draft** asks what the draft is for (you can leave it blank) and whether to export a PDF of it. Then, for draft 3 of a play called *Play*, frozen on 21 November 2026:

- A copy of the script goes in the drafts folder as `Play - Draft 03 - 2026-11-21.fountain`. Its title page says `Draft: 3` and `Draft date: 21 November 2026`, and what the draft is for goes in a `Draft notes:` key, which never prints.
- The script itself becomes `Draft: 4 (working)`, without a draft date. Undo puts it back.
- If the script links to notes, a copy of them goes beside the frozen draft as `Play - Draft 03 - 2026-11-21 - Linked notes.md`, so the draft's PDF can append them as they were. See [Linked notes](../linked-notes/).

A script with no title page gets one, with its file name as the title. Scripts in the drafts folder open read-only, in reading view. To change one, choose **Unfreeze draft** from its **More options** menu or the command palette. It stays editable until you close its tab.

The draft and its date print in the bottom right corner of the title page, so a PDF of the working script says "Draft 4 (working)". A style can put them bottom left or leave them off with `titlePage.draft`; APT leaves them off.
