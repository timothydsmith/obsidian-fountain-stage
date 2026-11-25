---
title: "Cast"
description: "Renaming and merging characters, who's on stage, the smallest cast, and the cast list and scene breakdown."
---

## Renaming a character

**Rename character**, from the command palette or a script's **More options** menu, renames a character throughout the script: its cues, its Characters list entry, and its name in stage directions, headings, notes and dialogue. Each is written in the case the old name was, so MARGARET becomes JANE and Margaret's becomes Jane's. A name all in lower case is left alone, so renaming WILL doesn't touch "will". The character is the one at the cursor, or one you choose. Before anything changes you see how many places of each kind will change, and where, and can leave any kind out. It's one step to undo.

## Who's on stage

Fountain Stage works out who's on stage from the stage directions, and shows it in the status bar for the cursor's line ("On stage: ANNA, TOM"). On a phone, which has no status bar, **Show who's on stage** says who's on at the cursor and who comes on or leaves next.

- **Entrances** are phrases such as "ANNA enters", "Enter TOM", "MRS PIKE comes in", "He returns", "She appears in the doorway" and "(entering)" in a speech.
- **Exits** are phrases such as "ANNA exits", "Exit TOM", "They both go out", "She leaves the room", "Exeunt" and "(going)" in a speech, which takes them off when the speech ends.
- **"He", "she" and "they"** mean whoever was last the subject of a stage direction or last spoke. Fountain Stage learns which characters are "he" and which "she" from the stage directions ("ALEX picks up his bag"), where the script makes it clear. "They" is the characters last named together, or everyone on stage, as "Exeunt" is.
- Whoever the scene's **opening stage direction** names is on from the start ("ANNA is at the table").
- Someone who **speaks without coming on** is taken to have been on from the start of the scene, since most scripts don't write every entrance. Speaking off, with (O.S.), (V.O.), (OFF) or (offstage) after the name, doesn't put them on.
- Each scene starts with the stage empty.

It reads "ANNA leaves the letter", "TOM turns to leave" and "She doesn't go out" as no exit at all. Where it gets one wrong, the Entrances and exits check will usually point there, and you can dismiss the finding.

## Merging characters

**Merge characters**, from the command palette or a script's **More options** menu, folds one character into another: choose the one to merge (the one at the cursor, if there is one), then the one to merge it into. It's a rename to the other character's name, with the same choice of places to change, and it first tells you the scenes they're both in, since those need rewriting by hand. It's one step to undo.

## The smallest cast

The report's **Smallest cast** finds the fewest actors who can play every part, where no actor plays two characters who are ever in a scene together (as the report's Doubling has it). It's often more than the biggest scene's cast, when characters share scenes in a ring. It also gives one way to share the parts out, with the small parts doubled before the big ones. Type a cast size in the box to see whether that many actors can play it, and if not, which scenes have more characters than actors. Fountain Stage remembers the size, and a saved report includes it.

## Cast list and scene breakdown

**Write cast list and scene breakdown**, from the command palette or a script's **More options** menu, writes both from the script:

- **Characters:** whoever speaks but isn't in the list is added at the end of it. Entries already there keep their descriptions, and notes in the list (such as who doubles whom) stay. Names in the list the script never uses are left in, and you're told which.
- **Scene Breakdown:** every scene heading, numbered, under its act. An entry that starts with the scene's title keeps what follows it ("3. The Kitchen, the next morning"), and an entry that names no scene keeps your own words for the scene with its number. Notes in the section stay.

Each goes where the script already has it, as a title-page key or a section such as `***Characters***`. A script with neither gets sections just before the play starts. Run it again whenever the script changes; it only changes what's out of date, and it's one step to undo.
