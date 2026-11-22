# Fountain Stage roadmap

Last updated 22 November 2026.

## Where things stand

Rewrites are under way, so releases focus on moving between drafts. Version 0.3.0 (moving text) shipped on 22 November 2026, after 0.2.0 (sections and freezing) earlier the same day. Fountain Stage is in Obsidian's community plugin directory.

Working assumptions:

- **One play per vault.** Settings such as the drafts folder apply to the whole vault.
- **Mobile stays in scope.** Vault APIs only, no Node or Electron.
- **Margin marks are back in scope.** Revision asterisks first, stage management cues later.
- **The engine stays style-neutral.** New print behaviour becomes a style field whose default leaves existing styles unchanged.
- **Follow the Fountain spec.** Sections and synopses never print. Anything that departs from the spec is a deliberate, documented choice.

## Release plan

Nine minor releases take the plugin from freezing drafts to a story outline, then 1.0 reviews the whole codebase. Each ships something usable on its own, and bug fixes go out as patch releases in between. The order follows dependencies: each release only needs what came before it.

| Release | Theme | Features | Needs |
| --- | --- | --- | --- |
| 0.2.0 | Sections and freezing (breaking) | Sections never print, act headings from scene headings, Freeze draft, Unfreeze, drafts folder setting, draft and date on the title page (`titlePage.draft`), draft notes on freeze | Nothing |
| 0.3.0 | Moving text | Cut from this draft, Restore cut, line bank, move scenes in the outline, split and merge scenes, renumber scenes, jump commands | Draft number from 0.2.0 |
| 0.4.0 | Comparing drafts | Changes since a draft, side by side, pass checklist, alternate lines | Frozen drafts from 0.2.0 |
| 0.5.0 | Checking the draft | Name consistency, voice check, stage direction check, overused words and pauses, speech length map, overlap marks | Nothing |
| 0.6.0 | Rehearsal pages | Margin marks, locked pages, revised pages for rehearsal | Matching from 0.4.0 |
| 0.7.0 | Cast | Merge characters, minimum cast, entrance and exit detection, who's on stage, entrances and exits check | Doubling data from the report |
| 0.8.0 | Focus and readings | Table read, calibrate runtime from a reading, runtime targets, typewriter mode, sprint timer | Nothing |
| 0.9.0 | Linked notes | Links to vault notes, rename following, append linked notes on export | Freeze from 0.2.0 |
| 0.10.0 | Story outline | Story beats and action beats, planning in the outline, outline by act and by beat, beat notes, framework templates, beat map | Sections from 0.2.0, outline moves from 0.3.0, linked notes from 0.9.0 |
| 1.0.0 | Review | No new features. A review of the whole codebase, and refactoring where it's needed | Everything above |

1.0 is about drafting, and nothing else gets in ahead of it. Between 1.0 and 2.0 come reporting and project management. Stage management follows 2.0.

To decide:

- [x] 0.5.0 lands as one release, all six checks together.

### Between 1.0 and 2.0

Five releases of reporting and project management, then a review at 2.0.0. Plain reports come first because they set up the export pipeline; the submission pack comes last because it gathers output from nearly everything before it.

| Release | Theme | Features | Needs |
| --- | --- | --- | --- |
| 1.1.0 | Reports | Report export (CSV, PDF in house style), synopsis export, casting breakdown, interval finder, settings and transitions | Minimum cast from 0.7.0 |
| 1.2.0 | Charts | Charts in the report view; draft history, pacing view, relationship map, character journey | Frozen drafts from 0.2.0 |
| 1.3.0 | Writing habits | Writing goals and pace, writing time, notes tracker | Nothing |
| 1.4.0 | Records of the play | Development history, readers log, submissions tracker, deadlines (read from submissions) | Notes tracker from 1.3.0 |
| 1.5.0 | Documents | Sides and cue scripts, submission pack | Reports from 1.1.0, development history from 1.4.0, the Markdown renderer from 0.9.0 |
| 2.0.0 | Review | No new features. A review of the whole codebase, and refactoring where it's needed, before stage management begins | Everything above |

The records in 1.4.0 are Markdown notes with properties, so Obsidian Bases can show them as tables.

## Now: rewrites and drafts

Four features, built in this order, after a fix that stops sections printing. Freezing makes the baselines, and both the changes report and rehearsal pages compare against a baseline.

1. Freeze draft
2. Cut from this draft
3. Changes since a draft
4. Revised pages for rehearsal

### Before freezing: sections never print (decided)

The Fountain spec says sections are ignored completely in formatted output, but Fountain Stage prints `#` as acts and `##` as scenes, carried over from fountain2pdf. This is fixed in 0.2.0, before frozen drafts start recording the old convention. It's a breaking change, which semantic versioning allows before 1.0.

- **Sections are structure only:** outline, runtime and report. Never printed, hidden in reading view, shown faintly in the editor.
- **Printed titles** come from forced scene headings (`.ACT ONE`, `.SCENE 2`), centred text (`> ACT ONE <`) and `===` page breaks, all of which the spec prints.
- **Act headings:** a scene heading matching the style's `act.pattern` (by default, starting with "ACT") takes the `act.*` style fields. Whether it starts a new page is up to the style (`act.newPage`); the built-in styles do.
- **Outline:** scenes nest under act headings, so `#` sections aren't needed for acts and scenes. They stay free for other grouping, such as beats. The outline, report and editor use the act pattern of the script's style, so they agree with the PDF.
- **Report:** scenes are scene headings only.
- **No convert command.** Scripts are assumed to follow the spec; the changelog says how to rewrite `#` acts and `##` scenes by hand.
- **Tests:** layout snapshots change on purpose. Parity with fountain2pdf ends for sections.

### 1. Freeze draft (released in 0.2.0)

- **Freeze draft** command, also in the script's More options menu.
- Reads the draft number from the working file's `Draft:` key. No key means Draft 1.
- Copies the script to the drafts folder (set in settings) as `Play - Draft 03 - 2026-11-21.fountain`. The number is zero-padded so files sort.
- The copy gets `Draft: 3` and `Draft date: 21 November 2026`.
- The working file gets `Draft: 4 (working)` and loses any `Draft date`.
- Asks each time whether to export a PDF of the frozen draft.
- Files in the drafts folder open read-only in reading view. **Unfreeze** makes one editable.
- On the title page, draft and date print bottom right, with contact details staying bottom left. A new style field, `titlePage.draft`, sets the corner or hides them. APT hides them by default.
- PDFs exported from the working file print "Draft 4 (working)".

Decided while building: the copy is named from the title-page `Title:` (as plain text), or the file name without one. Draft notes from Ideas and history came in with it, in a `Draft notes:` key that never prints. **Unfreeze** lasts until the tab closes, so nothing records which drafts are unfrozen. The drafts folder is `Drafts` to start with.

Decided:

- [x] Date format: "21 November 2026".
- [x] A script with no title page gets one on freeze, in both the frozen copy and the working file.
- [x] Draft notes on freeze, from Ideas and history, are part of it.

### 2. Cut from this draft (released in 0.3.0)

- A command cuts the selection from the script and adds it to `Play - Cuts.fountain`.
- Each cut sits under its own heading, filled in automatically, with an optional label: `# 21 Nov 2026 · Draft 4 · from 2.3 KITCHEN`.
- **Restore cut**, run from the cuts file, puts a cut back at the cursor in the script.
- It does boneyard's job without bringing boneyard back into scope.

Decided:

- [x] Order: script order, by where each cut came from in the play. The heading records the scene number and the line in that scene, which keep the order.
- [x] One cuts file per draft, `Play - Draft 04 - Cuts.fountain`, in the drafts folder. It's editable until its draft is frozen, then frozen with it.
- [x] Partial lines: cut exactly what's selected.
- [x] Undo in the script takes the cut out of the cuts file again, and redo puts it back. Restoring a cut takes it out of the working draft's cuts file, and undo of that puts it back.
- [x] Cuts files are files of their own, so a script's outline, report and runtime never count them.

### The rest of 0.3.0 (released)

Line bank, moving scenes, split and merge, renumbering and jump commands, from the drafting aids below.

Decided:

- [x] Line bank: one file beside the script, `Play - Line bank.fountain`, rather than one per draft or one in the drafts folder. Entries are paragraphs.
- [x] Putting in a line takes it out of the bank, and undo puts it back, using the cuts file's undo machinery.
- [x] A scene runs from its heading to the next scene heading or section. Moving swaps it with the unit next to it, so a scene can move from one act into the next. Text before the first heading never moves.
- [x] Split asks for the new heading, suggesting the current one with its number one on.
- [x] Renumber lets the user choose: from 1 in each act, or straight through the play. The choice is remembered. Numbers in words keep their case, and `#3#` scene numbers change too.
- [x] Jumps go to scene headings, acts included, and to the next speech by the character whose speech the cursor is in.
- [x] Phones can't drag in the outline, so a scene's menu (right-click, or press and hold) has Move scene up and Move scene down. Rows aren't draggable on phones and tablets, so a long press opens the menu.
- [x] The outline is central now, so it opens in the right sidebar the first time a script opens in the vault. Only once, remembered in settings, so closing it sticks.

### 3. Changes since a draft

- Compares the working file with any frozen draft (the latest by default), or two frozen drafts with each other.
- Report: scenes added, cut or moved; runtime change per scene; words gained or lost per character.
- Editor: a faint tint on changed lines in Live Preview, on screen only.
- Matching: scenes by heading first, then by similar content; within a scene, speech by speech.

Decided:

- [x] Its own tab, **Changes**, beside the script like the report, with a choice of the draft to compare with (the latest frozen one to start with), or two frozen drafts.
- [x] The tint is a toggle, off to start, and shows in reading view as well as Live Preview and source mode.
- [x] Our own code, not a diff library: scenes are matched first, so lines are only compared within a scene, which keeps it quick on a phone.
- [x] Scene headings only help match scenes when they're unique once scene numbers are taken out, so renumbering (every `SCENE 2` becoming `SCENE 3`) can't pair the wrong scenes. Title pages aren't compared, so freezing (which changes `Draft:`) isn't a change.

For 0.4.0 too, from the drafting aids:

- [x] Alternate lines go in a note under the live line, `[[alt: …]]`. Notes never print, so the file stays valid Fountain and PDFs show only the live version.
- [x] An alternate is of a whole speech (or action paragraph), and its notes go after the speech's last line. A note on a line of its own reads as a blank line, so one between a speech's lines would end the speech; the parser must keep matching fountain2pdf, so that isn't changed. Final Draft's alternate dialogue is per speech too. The versions go round in order, so **Switch to next alternate** repeated visits every one.
- [x] Pass checklists are kept in a Markdown note beside the script, `Play - Passes.md`, one checklist of scenes per pass. The last pass is the current one. Scenes are known by heading and which of the scenes with that heading they are, so duplicate headings keep their own ticks.
- [x] A scene ticks itself when it comes to differ from the draft during the pass, watched as you write. Scenes that differed when the pass started, or that you untick, don't tick themselves, so ticks never fight you. This needs no copy of the script kept at the start of the pass.
- [x] Side by side keeps the line at the top of each pane level, mapped through the matched lines. Moved and cut scenes have no counterpart, so scrolling jumps there. Not on phones.

### 4. Revised pages for rehearsal

- Lock a frozen draft as the rehearsal script. Its page breaks stay fixed from then on.
- After changes, export only the pages that changed. Overflow becomes 23A, 23B; a page that loses text ends short.
- Each revised page carries a header such as "Rev. 1 · 21/11/26" and an asterisk in the right margin beside each changed line.
- Uses the matching from feature 3 to find where each locked page starts in the new text. The layout engine already supports forced page breaks.
- Fallback if locking proves too hard: print each changed scene fresh, labelled "replaces pp. 23–25".
- Build the margin marks so they can carry stage management cues on the left later.

To decide:

- [ ] Revision numbers separate from draft numbers (Rev. 1, Rev. 2 of the rehearsal draft)?
- [ ] Revision colours (blue, pink, yellow and so on) named in the header?
- [ ] A page that loses all its text: number the survivor "23–24"?
- [ ] Moving the lock to a new draft partway through rehearsals.

## Next: drafting aids

All agreed. The release plan sets the order.

### Hearing it

- **Table read.** Reads the script aloud, with a voice per character and stage directions in a flat voice or skipped. Uses the browser's built-in speech, which works on desktop and most phones.

### Restructuring

- **Move scenes in the outline.** Built for 0.3.0. Drag a scene in the outline sidebar, or use Move scene up and Move scene down, and the text moves with it.
- **Split and merge scenes** (built for 0.3.0) at the cursor, keeping headings and synopses tidy.

### Checking the draft

- **Name consistency.** Flags cues that look like one character spelt two ways (MAGGIE and MARGARET, JON and JOHN), Characters list entries who never speak, and speaking characters missing from the list.
- **Voice check.** Per character: typical speech length, words only they use, and crutch phrases. Catches characters who have started to sound alike.
- **Stage direction check.** Flags directions an actor can't play ("she realises", "he remembers"), film language ("we see"), and directions running past a few lines.
- **Overused words and pauses.** Repeated phrases across the script, and scenes heavy with beats and pauses. Reuses the pause counting from runtime.
- **Speech length map.** The longest speeches and monologues, and where they sit in the play.

Decided for 0.5.0:

- [x] Findings go in their own tab, **Checks**, beside the script like Changes, each one a link to its line. Flagged lines are also marked in the editor, with a toggle like the change tint.
- [x] The stage direction check has built-in phrases, and you can add your own in settings, as with pause words.
- [x] A finding can be dismissed. The plugin remembers it for the vault until the text it's about changes.

Built in 0.5.0:

- A finding's key is its check, what it's about and a fingerprint of the text, so a dismissal lapses when that text changes. Up to 2000 are kept, oldest forgotten first.
- Names are alike when written the same but for punctuation, spelt within one letter (two for long names), one is the other plus words that aren't only titles, or the first word is a known short form. `MRS SMITH` and `MR SMITH` aren't alike: different titles are different people.
- Voices are profiled from five speeches up. "Closest to" is the cosine of word counts, with common words left out.
- Overlap slashes are marked in dialogue always; a slash is one not between two letters or digits, so "and/or" isn't one.
- The checks run in about 150 ms on a full-length play, once per version of the text, a second after typing stops.

### Tracking a rewrite pass

- **Pass checklist.** Name a pass ("dialogue pass", "act two structure") and tick scenes off in the outline. Once Changes since a draft exists, scenes touched since the last freeze can tick themselves.
- **Alternate lines.** Keep two versions of a line or speech and switch which is live, without cutting either. Needs a Fountain convention that keeps the file valid. Inspired by Final Draft's Alternate Dialogue.

### Focus

- **Typewriter mode.** The current line stays centred and the rest fades. Built in, since Obsidian's typewriter plugins won't reach the custom editor. Inspired by Final Draft 13's Typewriter view.
- **Sprint timer,** with a word count for the session.

### Cast and characters

- **Merge characters.** Fold two characters into one, like Rename, but first flag scenes where both are on stage, since those need rewriting by hand.
- **Minimum cast.** The fewest actors who can play every role, from the doubling data. Set a cap ("cast of 4") and see which scenes break it.
- **Entrance and exit detection.** Works out from stage directions who enters and leaves. Built once, it serves who's on stage, the entrances and exits check, and French scenes after 2.0.
- **Who's on stage** at the cursor, in the sidebar or status bar. Catches characters left silent for pages.
- **Entrances and exits check.** Flags characters who speak before entering, enter twice, or never leave.

### Structure and navigation

- **Renumber scenes** (built for 0.3.0) after moving or splitting them: scene headings and any scene numbers.
- **Runtime targets** for the play, an act or a scene, shown over or under in the outline.
- **Jump commands** (built for 0.3.0): next or previous scene, and the next speech by the character at the cursor.

### Ideas and history

- **Line bank.** Built for 0.3.0. The opposite of the cuts file: lines not yet placed. Quick capture on the phone, then drop one at the cursor. Shares the cuts file's machinery.
- **Draft notes on freeze.** Freeze asks "What's this draft for?" and keeps the answer on the frozen copy in a title-page key that isn't printed. Built with Freeze draft in 0.2.0.
- **Side by side.** The working file and a frozen draft, scrolling together.

### Readings

- **Calibrate runtime from a reading.** Tap through scenes during a read-through, and the words-per-minute and pause times adjust to match.
- **Overlap marks.** Caryl Churchill's slash for overlapping dialogue, shown clearly in the editor, with a check that each slash is followed by a speech.

### Linked notes

- **Syntax, from the [Fountain plugin](https://github.com/bgrundmann/obsidian-fountain):** `[[>target]]` or `[[>target|display text]]`. The `>` tells a link from an ordinary note. Targets resolve like Obsidian links, by name or path, with or without `.md`. Scripts move between the two plugins without changes.
- **Where:** in stage directions and on lines of their own, not in dialogue, scene headings or cues.
- **In the editor:** note names complete after `[[>`, a click opens the note (Ctrl/Cmd-click in a new tab), hovering shows Obsidian's page preview, and a link to a missing note looks broken.
- **Renames:** Obsidian doesn't track links inside `.fountain` files, so the plugin updates them when a linked note is renamed, keeping the form you wrote.
- **On export:** an **Append linked notes** option adds each linked note after the script, on its own page under its title, in order of first link and once each. Frontmatter is dropped.
- **On freeze:** a single Markdown note of every linked note sits beside the frozen script, as `Play - Draft 03 - 2026-11-21 - Linked notes.md`, each note under its own heading. Exporting a frozen draft appends from that note, not the live ones, so the PDF can be rebuilt as it was.
- **The hard part** is a Markdown renderer for the PDF: headings, paragraphs, emphasis, lists and probably images. The layout engine only lays out Fountain today.
- New style fields for the appendix (heading size, a page per note), with defaults that leave existing styles unchanged.

To decide:

- [ ] Links in dialogue from scripts written in the other plugin: treat them as links anyway, or as plain notes?
- [ ] In the printed script, with Include notes on: print the display text, or leave links out?
- [ ] Which Markdown the appendix supports: images? tables? embeds?
- [ ] Links inside linked notes: followed, or one level only?
- [ ] Reading view: show links, or hide them with other notes?

### Story outline and beats

An outline tool over the script itself, not a separate outline note. Structure lives in the Fountain file, so it can't drift from the script.

- **Story beats** are `#` sections: play-level structure, with each scene belonging to the beat it sits under. Sections never print, which is what the spec intends them for.
- **Action beats** are `##` sections inside a scene: units of action that can start partway through. Which depth means which is a setting.
- **Planning in the outline.** Add beats, and scenes under them, in the outline panel. Each appears in the script as you add it, as a section or scene heading with a synopsis. No generate step: the structure is the script from the start.
- **Two views of one file.** By act (acts from ACT headings, then scenes) and by beat (beats, then scenes). Story beats needn't line up with act breaks.
- **Notes on beats and scenes.** Short notes as `=` synopses. Longer ones in a linked note (`[[>Beat - Catalyst]]`), with a command that creates the note and links it.
- **Your own beats by default.** An **Import framework** command inserts a framework's beats as empty sections, each with a short description as its synopsis.
- **Framework templates** are files, like styles: beats with a description and a target position as a share of runtime. Built in: Freytag's pyramid, three-act structure, Story Spine, Story Circle, Kishōtenketsu and Save the Cat, described in our own words. Your own templates go in a folder.
- **Beat map.** Built in two stages. First, the outline's by-beat view: drag to reorder and remap, with runtime and synopses inline. Then a board: a timeline left to right, with scenes sized by runtime under bands for each beat and markers for framework targets. A toggle switches to equal widths, so it works as a card board for shuffling, and empty planned scenes get a minimum width. Within a scene, action beats show the same way. No Obsidian Canvas, since a separate file would drift from the script.

### Open questions for drafting aids

- [x] A Fountain convention for alternate lines: a note under the live line, `[[alt: …]]` (decided for 0.4.0).
- [ ] How to detect entrances and exits: phrases such as "enters" and "exits", a stricter convention, or both.

## After 1.0: project management, alongside reporting

Ideas, not yet committed. With one play per vault, a dashboard across several scripts is dropped.

- **Writing goals and pace.** Targets in runtime as well as words ("90 minutes by 1 March"), with the pace needed to get there. A line logged to the daily note keeps the record in the vault. Inspired by Final Draft 13's Writing Stats and Celtx's Goals and Insights.
- **Writing time.** Time spent with the script open and typing, shown as hours per draft and a calendar of writing days. Builds on writing goals.
- **Deadlines.** Competition and submission dates, with a countdown in the status bar and a line in the daily note as one gets close.
- **Notes tracker.** Every `[[note]]` listed by scene, with prefixes such as `[[TODO: …]]` or `[[Q: …]]`, ticked off as resolved. Notes stay plain Fountain. Inspired by Final Draft's ScriptNotes.
- **Readers log.** Who has received which draft, when, and whether their feedback is in. Links to the notes tracker, so notes trace back to the reader.
- **Development history.** Readings, workshops and showings, each with date, venue, people involved and the draft used.
- **Submissions tracker.** Each submission logged with theatre or competition, deadline, status, and the frozen draft and PDF sent. Written as Markdown notes with properties, so Obsidian Bases draws the table. Depends on Freeze draft.
- **Submission pack.** One PDF of what theatres and competitions ask for: synopsis, character breakdown, cast size (from minimum cast), runtime, development history, sample pages, and a bio from a linked note. Pairs with the submissions tracker.

## After 1.0: reporting

Ideas, not yet committed. All of these read the writer's script and need no stage management markup.

- **Draft history.** Runtime, pages, cast size and words across every frozen draft, charted over time. Shows whether rewrites are tightening or bloating the play.
- **Relationship map.** Who shares scenes with whom, and who speaks after whom, drawn as a network. Shows which pairings carry the play and who never meets.
- **Character journey.** For one character: every scene, their dialogue share act by act, and all their lines in order. The writer's version of sides.
- **Interval finder.** The scene break nearest halfway by runtime, with how the two halves compare.
- **Settings and transitions.** Every setting from the scene headings, the number of set changes, and how long each scene runs before the next change.
- **Synopsis export.** The `=` synopses gathered into a scene-by-scene outline document.
- **Sides and cue scripts.** A PDF per actor with their lines highlighted, or only their lines plus the last few words of each cue.
- **Casting breakdown.** Each character's description from the Characters list, with scenes, size of role and doubling options.
- **Pacing view.** A timeline of runtime per scene, the balance of dialogue and stage directions, and who's on stage when.
- **Report export.** The script report as CSV, or as a PDF in the script's house style.

## After 2.0: stage management

Ideas, not yet committed. Everything here lives in the prompt copy and builds on the margin marks from rehearsal pages (0.6.0).

- **Cue numbers in the margin.** LX and SQ cues on the left, using the same machinery as revision asterisks on the right.
- **Production breakdown.** Tags such as `[[prop: suitcase]]` in the prompt copy. Reports: props per scene, a costume plot with quick-change warnings, sound and lighting cue lists. Inspired by Celtx's breakdown tagging.
- **French scenes.** A new unit whenever someone enters or exits, each listing who's on, for rehearsal calls. Uses entrance and exit detection from 0.7.0.

### WWWWW sheet

A stage management sheet with one row per character per French scene: who, where, when, wearing, with.

- **Who:** from cues, plus entrance and exit detection from 0.7.0.
- **When:** the scene and French scene, and the page from the layout.
- **Where:** the entrance and exit points (SL, SR, UC and so on), read from directions like "enters SL" or from a tag.
- **Wearing:** costume tags such as `[[costume: red coat]]`, carried forward until the next change.
- **With:** prop tags, following each prop on and off with the person carrying it.
- **Two views:** by scene (what each scene needs) and by character (each actor's track through the show).
- **Checks:** a costume change with too little time between exit and next entrance; a prop that leaves with someone who never brought it on; a prop left on stage.
- **Output:** a report tab, a Markdown note, and CSV.

Builds on French scenes and the production breakdown above.

To decide:

- [ ] Time for a quick change: from the runtime estimate, or a set minimum?

### Prompt copy (agreed)

Stage management markup lives in a prompt copy made from the locked rehearsal draft (0.6.0), never in the writer's working file. Cue numbers, breakdown tags and the WWWWW sheet all read from it.

- **Locked text.** The script text is read-only in the prompt copy. Only notes can be added or changed: cues, tags, blocking. Fixes to the script go through the writer, so there is one source of truth.
- **Writer's notes and links** (`[[…]]`, `[[>…]]`) count as script text: locked, readable, and updated with each revision. They're hidden by default, without being removed, and a view setting shows them.
- **Ownership by comparison.** The prompt copy's base is the frozen rehearsal draft. Any note in the prompt copy that isn't in the base belongs to the stage manager, so their notes need no special marking.
- **Prefixes for meaning, not ownership.** `[[cue: LX 12]]`, `[[prop: suitcase]]` and `[[costume: red coat]]` tell reports what a note is. Plain notes such as "blocking: crosses DSL" are still the stage manager's.
- **Applying a revision.** Compare the old script with the new one, carry each stage management note to its matching place, take the writer's text and notes from the new revision, and write the result back.
- **Word-level matching.** Cues often sit on a word, so the matching from 0.4.0 needs a word-by-word mode for this.
- **Displaced notes.** A note whose text was cut goes to where the cut was, flagged, and appears in a review list to re-place or delete.
- **Revised lines highlighted** after applying, so cues near changes can be checked.
- **A record.** The title page notes the revision applied ("Rev. 2"). Applying the same revision twice does nothing.
- **Base fingerprint.** The prompt copy keeps a fingerprint of its base and refuses to apply a revision if the base has been unfrozen and edited.

### Placing cues

Cues go at any word: in a speech, a stage direction, or between lines. A cue is a note at that point, such as `[[cue: LX 12]]`, which Fountain allows mid-line.

- **Insert cue** at the cursor, from a command or the mobile toolbar. It snaps to the nearest word boundary and asks for the department and number.
- **Departments** are a setting, starting with LX, SQ, FS, AV and Fly.
- **Numbering:** the next number in sequence for that department. A cue placed between 12 and 13 becomes 12.5, as theatres number them, and a **Renumber cues** command tidies up before tech.
- **Standbys and warnings** are placed by hand for now, as `[[standby: LX 12]]` and `[[warn: LX 12]]`, with the same insert command.
- **Several cues at one point** (LX 12 with SQ 4) share one arrow, stacked in the margin.
- **The mark:** a down arrow in the space above the line, pointing at the go point, with the cue in the left margin. The note's text never breaks up the line.
- **In the PDF:** the cue is lifted out of the text so line breaks don't move. The layout already knows where each character sits, so the arrow lands over the exact word.
- **Calling script:** a cue sheet listing each cue with its page and the words it goes on ("LX 12, p. 23, on 'door'").
- **Revisions:** cues ride on the word-level matching, and a cue whose word was cut goes to the displaced-note review.

To decide:

- [ ] Room for the arrow: extra space only above lines with cues, or wider line spacing throughout the prompt copy? Single-spaced speeches leave little room.

## Housekeeping

Changes to CLAUDE.md before building, so later sessions work from the same rules.

- [x] Remove "margin marks" from the out-of-scope list.
- [x] Record the one-play-per-vault assumption under Constraints.
- [x] Remove "links" from the out-of-scope list, and describe `[[>target]]` links to vault notes.
- [x] Say that sections never print, and that layout parity with fountain2pdf no longer covers sections.
- [x] Remove "index cards" from the out-of-scope list.
