# Changelog

All notable changes to Fountain Stage are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

Add new entries under **Unreleased** as you work on `dev`, grouped as Added, Changed, Fixed or Removed. When you release, rename **Unreleased** to the version and date, and start a fresh **Unreleased** section above it. The full steps are in the README under [Branches and releases](README.md#branches-and-releases).

## [Unreleased]

## [0.11.0] - 2026-11-25

### Added
- **Set up a play**, from the command palette or the top of the settings, makes the folders in settings that aren't there yet (drafts, beat notes, frameworks, styles and fonts), and offers a first script, with a title page, in a vault with no scripts. The first time the plugin loads in a vault with no scripts, a notice offers it.

## [0.10.0] - 2026-11-24

### Added
- A story outline. `#` sections are story beats, which hold the scenes after them, and `##` sections inside a scene are action beats (the **Action beats** setting changes which depth is which). The outline shows the script **by act** or **by beat**.
- Planning in the outline: add beats, scenes and action beats, write synopses, and create a linked note for a beat or scene (in the new **Beat notes folder**). Each goes straight into the script. Drag beats to move them with what they hold.
- **Import framework** inserts the beats of three-act structure, Freytag's pyramid, Story Spine, Story Circle, Kishōtenketsu or Save the Cat, or a framework of your own from the **Frameworks folder**, as empty beats with descriptions.
- **Show beat map** opens the play as a timeline: scenes sized by runtime (or all the same width, as cards) under bands for their beats, with action beats, acts and a framework's beats marked. Drag scenes and beats to move them.

### Changed
- Moving a scene, by dragging it or with **Move scene up** and **Move scene down**, takes its action beats with it.
- The outline no longer mixes sections in with acts: by act it shows acts and scenes, and `#` sections show by beat. `##` and deeper sections are action beats, shown inside their scene; to keep using `##` sections to group scenes, set **Action beats** to `### and deeper`.

## [0.9.1] - 2026-11-24

### Added
- Find and replace in a script: Obsidian's hotkeys for searching in a file (Ctrl/Cmd+F, and Ctrl/Cmd+H to replace) now open a search bar at the top of a script, as does **Find in script**. Reading view and frozen drafts only find.
- **Search scripts**, a panel in the left sidebar that finds text in every script in the vault, which Obsidian's own search doesn't look inside. Click a line to go there.

## [0.9.0] - 2026-11-24

### Added
- Links to notes in the vault, as the Fountain plugin writes them: `[[>Note]]` or `[[>Note|display text]]`. Note names complete after `[[>`; a click in reading view (or Ctrl/Cmd-click while editing) opens the note; hovering shows its preview; and a link to a missing note looks broken. Reading view shows a link's display text.
- Links follow a renamed note, keeping the way each was written, asking first unless Obsidian's **Automatically update internal links** setting is on. Frozen drafts are left as they were.
- **Append linked notes** in the export dialog adds the notes a script links to after it, each under its title on a page of its own, with their headings, lists, quotes, tables, pictures and embedded notes. A style's new `appendix` settings set the titles and whether each note starts a page.
- Freezing a draft keeps a copy of the notes it links to beside it (`… - Linked notes.md`), which its PDF appends.
- With **Include notes** on, a link prints as its display text.

## [0.8.0] - 2026-11-24

### Added
- Who's on stage at the cursor, in the status bar, worked out from entrances and exits in the stage directions ("ANNA enters", "Exit TOM", "She goes out", "Exeunt", "(entering)"). **Show who's on stage** says the same on a phone, with the next entrance or exit.
- An **Entrances and exits** check: a character who speaks after leaving or before coming on, comes on or leaves twice, or stays on stage a long time without a word.
- The report's **Smallest cast**: the fewest actors who can play every part, one way to share the parts out, and a box to check a cast size against, which says which scenes have too many characters for it.
- Silence in the report: the pauses and silences the script asks for, added up, in the totals and for each scene.
- **Merge characters** folds one character into another, saying first which scenes they're both in.
- **Write cast list and scene breakdown** writes the Characters list and Scene Breakdown from the script, adding new speakers and keeping descriptions and notes already written.

### Fixed
- A Characters section with only names on its lines (`ANNA` over `TOM`) is no longer taken for a speech that starts the play.

## [0.7.0] - 2026-11-22

### Added
- **Start a table read** reads the script aloud from the cursor, with a voice for each character and a narrator for stage directions (or none). Parts you read yourself are highlighted, and the read waits for you to go on.
- Runtime targets for the play, an act, a scene or a section, set from the outline or the command palette. The outline and status bar show how far over or under each one runs. They're kept in the script, as a `Target:` title-page key and `[[target: 10 min]]` notes, and never print.
- **Time a read-through** times a reading scene by scene, keeps the times in `Play - Readings.md` beside the script, and offers to adjust the runtime estimate to match.
- **Toggle typewriter mode** keeps the line you're writing in the middle of the screen and fades everything but its paragraph.
- **Start a sprint** times a burst of writing and counts the words you add.

### Changed
- The outline's right-click menu (press and hold, on a phone) now works on acts and sections too, for setting runtime targets.

## [0.6.0] - 2026-11-22

### Added
- Rehearsal pages. **Lock rehearsal script** fixes the page numbers of the latest frozen draft, and the working script's page breaks follow them. **Issue revised pages** saves a PDF of just the pages that changed since, numbered to fit around the others (23A and 23B for text that runs on, 23–24 for a page that loses all its text), with a revision header and an asterisk beside each changed line or cut. It freezes a draft recording the revision, so the next one builds on it. **Unlock rehearsal script** takes the lock off.
- A `revision` group in styles, for the revised pages' header and margin mark.

### Changed
- Changes since a draft keeps a cut or added run of lines together, rather than matching a repeated line, such as a cue, with the first one like it.

## [0.5.0] - 2026-11-22

### Added
- **Show checks** opens a Checks tab beside the script, with checks on the draft: cue names that may be one character written two ways, and names missing from or silent in the cast list; stage directions an actor can't play, screen language, phrases of your own and long stage directions; overlap slashes with no speech after them; phrases repeated three times or more; and scenes with many more pauses than the play. Each finding links to its line, and can be dismissed until the text it's about changes.
- The Checks tab also shows each character's voice (typical and longest speech, words only they use, phrases they come back to, and whose words are most like theirs), filler words and who says them, and a map of speech lengths through the play with the longest speeches.
- **Mark check findings** underlines what the checks find in the script. It's off to start with.
- Overlap slashes in dialogue show in the accent colour.
- Settings for the checks: marking findings in the editor, your own phrases to check in stage directions, and bringing back dismissed findings.

### Fixed
- The Changes tab is no longer blank when Obsidian starts with it as the active tab.

## [0.4.0] - 2026-11-22

### Added
- **Show changes since a draft** opens a Changes tab beside the script: what's changed since the latest frozen draft, or a draft you choose, or between two frozen drafts. It shows the change in runtime and words spoken, every scene added, cut, moved or changed (matched by its text, so renumbering doesn't hide it), and each character's words then and now. Click a scene to go there.
- **Tint changes since a draft** tints new and changed lines in Live Preview and reading view. It's off to start with.
- **Show side by side with a draft** opens the draft to the left of the script, the two scrolling together line for line. Not on phones.
- Alternate lines: **Keep as an alternate** keeps a copy of the speech or stage direction at the cursor in a note under it (`[[alt: …]]`) to rewrite from, and **Switch to next alternate** and **Choose an alternate** change which version is live. Alternates never print, even with notes included in the PDF.
- Pass checklists: **Start a pass** adds a checklist of every scene to `Play - Passes.md` beside the script. The outline shows the current pass with a tick box for each scene, and scenes you change during the pass tick themselves. **Open passes** opens the note.

## [0.3.0] - 2026-11-22

### Added
- **Cut from this draft**, from the command palette or a script's **More options** menu. It moves the selected text into the current draft's cuts file in the drafts folder (`Play - Draft 04 - Cuts.fountain`), under a heading saying which scene and line it came from and when. Cuts are kept in the order of where they came from in the play. Undo in the script puts the text back and takes it out of the cuts file.
- **Restore cut**, in a cuts file, puts the cut at the cursor back into the script, at the script's cursor, and takes it out of the cuts file. Undo puts it back in the cuts file.
- A draft's cuts file stays editable until the draft is frozen, then opens read-only like the frozen draft. Restoring from it copies the cut and leaves the file as it is. Reading view of a cuts file shows the cut headings, though sections are hidden elsewhere.
- **Move scene up** and **Move scene down** move the scene at the cursor, with all its text, past the scene, act or section next to it. In the outline, drag a scene above or below another heading to move it there, or right-click it (press and hold, on a phone) to move it up or down.
- **Split scene** starts a new scene at the cursor's line, asking for its heading and suggesting the current heading with its number one on.
- **Merge with previous scene** takes out the heading of the scene at the cursor, joining it to the scene before, and moves its synopsis up to join that scene's.
- **Renumber scenes** rewrites `SCENE 3` or `SCENE THREE` in scene headings, and `#3#` scene numbers, so scenes count in order, from 1 in each act or straight through the play. It shows every change first, and remembers which way you count.
- **Go to next scene**, **Go to previous scene**, **Go to this character's next speech** and **Go to this character's previous speech**.
- A **line bank** beside each script (`Play - Line bank.fountain`) for lines not yet placed. **Add to line bank** adds a line, starting from the selection. **Put in a line from the line bank** puts one in at the cursor and takes it out of the bank; undo puts it back.

### Changed
- The script outline opens in the right sidebar the first time you open a script in a vault, so you don't have to find **Show script outline**. It only does this once; if you close it, it stays closed. On a phone it's added to the right sidebar without opening the sidebar.

### Fixed
- Ctrl+Shift+Z redoes in scripts on Windows and Linux, as it does in notes. Only Ctrl+Y did before.

## [0.2.0] - 2026-11-22

### Added
- **Freeze draft**, from the command palette or a script's **More options** menu. It saves a copy of the script as it is now in the drafts folder, named for the play, draft and date (`Play - Draft 03 - 2026-11-21.fountain`), with `Draft: 3` and `Draft date: 21 November 2026` on its title page. The script itself moves on to `Draft: 4 (working)`, and undo puts it back. The draft number comes from the `Draft:` key, and a script without one is draft 1. Freezing asks what the draft is for, kept on the copy in a `Draft notes:` key that never prints, and whether to export a PDF of it. A script with no title page gets one.
- A **Drafts folder** setting, `Drafts` to start with. Scripts in it open read-only, in reading view. **Unfreeze**, in a draft's **More options** menu or as the **Unfreeze draft** command, makes one editable until you close its tab.
- The draft number and date print in the bottom right corner of the title page, so a PDF of the working script says "Draft 4 (working)". A new `titlePage.draft` style setting puts them bottom left, or `"hide"` leaves them off. APT leaves them off.

### Changed
- `Draft:` and `Draft date:` no longer print with the contact details on the title page; they go in the corner instead.
- **Breaking:** sections never print, as the Fountain spec says. `#` and `##` lines used to print as acts and scenes; now they're structure only, for the outline. Reading view hides them, and the editor shows them faintly. To print act and scene titles, write them as scene headings: `# Act One` becomes `.ACT ONE`, and `## Scene Two` becomes `.SCENE TWO`.
- Act headings are scene headings that match the style's new `act.pattern` setting (by default, those starting with "Act"). They print in the act style, and a new `act.newPage` setting chooses whether each starts a new page; the built-in styles do. The outline, report, status bar and editor find acts the same way, using the script's style.
- The outline nests scenes under acts, and sections inside acts. The report counts scene headings as scenes, and acts from act headings.
- Scene headings always print in capitals, so a scene that was a `## Scene Two` section prints as SCENE TWO once it's a scene heading.

### Removed
- The `scene.uppercaseSections` style setting, since sections no longer print. Style files that set it still load, and it's ignored.

## [0.1.3] - 2026-11-18

### Changed
- Fountain Stage now needs Obsidian 1.13 or later. Its settings are drawn the way Obsidian 1.13 draws settings, and the older way is gone.

## [0.1.2] - 2026-11-18

### Changed
- Releases are built by GitHub Actions, with artifact attestations that prove `main.js`, `manifest.json` and `styles.css` were built from this repository.
- Styles and fonts are found by reading only the styles and fonts folders, not by listing every file in the vault.

## [0.1.1] - 2026-11-18

### Changed
- Fountain Stage is now in Obsidian's community plugin directory, and the README's install steps use it.

## [0.1.0] - 2026-11-18

The first release.

### Added
- `.fountain` files open in Fountain Stage's own editor.
- Formatting as you type, laid out as a stage play: act and scene headings centred, character cues centred, parentheticals and stage directions in italics, transitions to the right, and `*italic*`, `**bold**` and `_underline_` shown as they'll print. Forcing marks (`.`, `@`, `!`, `~`, `>`, `<`, `^`), section `#`s and emphasis markers stay visible but faint. Notes are highlighted and boneyard text is dimmed. The title page and any `***Characters***`-style breakdown sections are shown as such.
- The editor follows Obsidian's **Readable line length** setting.
- Each script reopens where you left it, with the cursor and scroll position you had, including after Obsidian restarts. Positions are kept on each device rather than synced, and follow a script when it's renamed. Obsidian's back and forward buttons return to the same place too.
- Line numbers for every line of a script, shown when Obsidian's **Settings → Editor → Show line number** is on, the same as for notes. Changing the setting updates open scripts straight away.
- Live Preview, source mode and reading view, as for notes. Source mode is the plain text, unformatted. Reading view shows the formatted script without its markup, notes, synopses or boneyard, and can't be edited. Scripts open in the mode set by Obsidian's **Default view for new tabs** and **Default editing mode** settings, and each tab remembers its mode. Switch with the button at the top of a script, its **More options** menu, the **Toggle reading view** and **Toggle source mode** commands, or the same hotkeys as notes (Ctrl/Cmd+E for reading view).
- Character names complete as you type. Typing two capital letters in a row anywhere in a line, in a cue or a stage direction, offers the script's character names that start that way, from its cues (those with the most lines first) and its Characters list. Enter or Tab picks one, and Escape closes the list. Once a whole name is typed, nothing more is offered, so Enter after a cue starts a new line.
- Tab sets what a line is. On an empty line after a blank line, it lists the script's character names to pick from, narrowed as you type. On a line of text, it changes the line from action to character to scene heading to transition and back, with Shift+Tab going the other way; going round gives the original text back, and forcing marks are only added where needed. In a speech, it switches a line between dialogue and parenthetical, or starts a parenthetical on an empty line. **Next line type** and **Previous line type** commands do the same for touch keyboards.
- Text before the play begins is only treated as preface (author's notes and the like) until the first act, scene, scene heading or character cue. A script with speeches but no scene headings no longer reads as all preface, so its stage directions are formatted and exported as stage directions.
- A script report, opened with **Show script report** in a tab beside the script, that updates as you write. It has totals (pages, runtime, words, speeches, acts, scenes, characters); each character's speeches, words, share of the dialogue, speaking time, scenes, and first and last scene; each scene's act, pages, runtime, speeches, words and cast; a chart of who's in each scene (speaking, or named in a stage direction); and the characters who never share a scene, so one actor could play both. Click a character or scene to go there. **Save script report as a note** saves it as a Markdown note beside the script.
- **Rename character** renames a character throughout a script: cues, the Characters list, and the name in stage directions, headings, notes and dialogue, each in the case it was written in. A name written all in lower case is left alone. It renames the character at the cursor, or one you choose, and first shows how many places of each kind will change, and where, with a switch to leave each kind out. One undo puts it all back.
- The status bar shows what the cursor's line is, such as Character, Dialogue, Parenthetical, Stage direction, Scene heading, Act or Scene, as Fountain Stage reads it.
- A script outline in the sidebar, opened with **Show script outline**. It lists the acts, scenes and scene headings of the script you're in, nested, with each one's synopsis. Click one to go there. The part you're in is highlighted, and the outline updates as you type. Acts and scenes with others inside them can be collapsed.
- Page breaks in the editor: a rule where each page of the script's PDF starts, labelled with its page number, in Live Preview and reading view. Pages are found in the style the script's `Style:` key names, or the **Style for page breaks** setting, with the same fonts the PDF would use, and catch up a moment after you stop typing. The status bar shows the page you're on and how many pages there are. **Show page breaks** turns the rules off.
- A runtime estimate, in the status bar for the whole script and in the outline for each act and scene. It goes by the words spoken (dialogue at 150 words a minute, stage directions at half that, plus the pauses a script asks for with words such as beat, pause and silence, timed by default as in the Author's Note to Annie Baker's *Circle Mirror Transformation*) or by pages (a minute a page). The method and rates are in Fountain Stage's settings. A **Pause words** page there sets each word's time, its short and long times ("a brief pause", "a long silence"), and lets you add words and phrases of your own.
- The Characters list is read better for name completion: a name can be followed by a run of spaces and a description (`NORA     34. Student support officer`), and lines of prose in the list are no longer taken for names.
- **New script** command and ribbon button, which create `Untitled.fountain` in the folder Obsidian uses for new notes.
- **Export to PDF**, from the command palette, a script's file menu, or the button at the top of an open script. It lays out the script as a stage play in one of three built-in house styles: Modern Play Format (Dramatists Guild), Australian Plays Transform (APT), or Samuel French / SFI. Pages break in the same places fountain2pdf put them. The PDF is saved next to the script with the same name, replacing any earlier export, and opens in a new tab.
- An export dialog: choose the style, add a watermark (such as DRAFT) printed faintly across every page, and include notes (in grey, in square brackets, where they're written) and synopses. It remembers your choices. A `Style:` key on the title page, for example `Style: apt`, picks the style it starts in, and is never printed. Style files can set how notes, synopses and the watermark look.
- Styles of your own: JSON files in a styles folder that `extends` a built-in style or another of yours and change only the settings that differ. Lengths take units (`"25mm"`, `"1in"`). A file with problems is left out, and each problem is listed with the setting and the reason.
- Fonts from your vault: `.ttf` and `.otf` files in a fonts folder, matched by the family named in the file, so APT can use real Palatino. Without the font, PDFs use the style's fallback (Times for the built-in styles) and say so.
- Settings for the styles and fonts folders, which also list the styles and font families Fountain Stage found and any problems with them.
- Fountain Stage's settings appear in Obsidian's settings search, in Obsidian 1.13 and later.

[Unreleased]: https://github.com/timothydsmith/obsidian-fountain-stage/compare/0.11.0...HEAD
[0.11.0]: https://github.com/timothydsmith/obsidian-fountain-stage/compare/0.10.0...0.11.0
[0.10.0]: https://github.com/timothydsmith/obsidian-fountain-stage/compare/0.9.1...0.10.0
[0.9.1]: https://github.com/timothydsmith/obsidian-fountain-stage/compare/0.9.0...0.9.1
[0.9.0]: https://github.com/timothydsmith/obsidian-fountain-stage/compare/0.8.0...0.9.0
[0.8.0]: https://github.com/timothydsmith/obsidian-fountain-stage/compare/0.7.0...0.8.0
[0.7.0]: https://github.com/timothydsmith/obsidian-fountain-stage/compare/0.6.0...0.7.0
[0.6.0]: https://github.com/timothydsmith/obsidian-fountain-stage/compare/0.5.0...0.6.0
[0.5.0]: https://github.com/timothydsmith/obsidian-fountain-stage/compare/0.4.0...0.5.0
[0.4.0]: https://github.com/timothydsmith/obsidian-fountain-stage/compare/0.3.0...0.4.0
[0.3.0]: https://github.com/timothydsmith/obsidian-fountain-stage/compare/0.2.0...0.3.0
[0.2.0]: https://github.com/timothydsmith/obsidian-fountain-stage/compare/0.1.3...0.2.0
[0.1.3]: https://github.com/timothydsmith/obsidian-fountain-stage/compare/0.1.2...0.1.3
[0.1.2]: https://github.com/timothydsmith/obsidian-fountain-stage/compare/0.1.1...0.1.2
[0.1.1]: https://github.com/timothydsmith/obsidian-fountain-stage/compare/0.1.0...0.1.1
[0.1.0]: https://github.com/timothydsmith/obsidian-fountain-stage/releases/tag/0.1.0
