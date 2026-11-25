---
title: "Rehearsal pages"
description: "Locking a draft's pages for rehearsal, and issuing revised pages."
---

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

Each revised page has a header, "Rev. 1 · 22 November 2026", and an asterisk in the right margin beside every line of a changed speech or stage direction, and beside the line after a cut. The style's `revision` settings change the header, the mark and where they go (see [Styles of your own](../styles/)).

The title page and anything before the first page of the play aren't revised. Locked pages are worked out again from the locked draft each time, so changing the style or fonts it uses moves its page breaks: leave them alone while it's locked. Changes are matched scene by scene, so cutting or merging a scene heading can mark more pages than it might.
