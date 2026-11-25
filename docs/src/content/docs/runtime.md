---
title: "Runtime"
description: "The runtime estimate, runtime targets, and timing read-throughs."
---

## The estimate

Fountain Stage estimates how long the play runs: in the status bar for the whole script, and in the outline for each act and scene. It goes by one of two methods, set in Fountain Stage's settings:

- **Words spoken** (the default): dialogue at 150 words a minute, stage directions at half that, and the pauses the script asks for. A pause word (beat, moment, pause, silence) counts in any parenthetical, and in a stage direction where it stands on its own, as in "Beat.", "A long silence." or "After a pause, she sits", but not "A moment later". Each pause word has its own time, a short time (after short, brief, slight, tiny, little or quick) and a long time (after long, longer, lengthy, extended, endless or interminable). A number multiplies it, so "two beats" is twice a beat, and plurals count too. Change the times, or add words and phrases of your own (such as "lights fade"), under **Pause words** in Fountain Stage's settings.

  | Word | Seconds | Short | Long |
  |---|---|---|---|
  | beat | 1 | 0.5 | 2 |
  | moment | 2 | 1 | 4 |
  | pause | 2 | 1 | 4 |
  | silence | 5 | 2.5 | 7 |

  The times for pause and silence follow the Author's Note to Annie Baker's *Circle Mirror Transformation*. Baker calls a beat less than a pause, and doesn't time a moment or a short silence, so a beat is 1 second, a moment is taken as a pause, and a short silence is half a silence.
- **Pages**: a minute a page of the PDF.

Set a runtime target for the play, an act or a scene, and the outline and status bar show how far over or under it runs. Time a read-through to bring the estimate into line with how the play really reads.

## Targets

Right-click an act, scene or section in the outline (press and hold, on a phone) and choose **Set runtime target**, or **Set runtime target for the play**. The commands **Set runtime target for this scene** (the act, scene or section the cursor is in) and **Set runtime target for the play** do the same. Write the target as `10 min`, `1 h 30 min`, `45 s`, `12:30` (minutes and seconds) or a number of minutes. Leave it blank to take it off.

The outline shows how far over or under its target each one runs, beside its runtime: "2 min over" in red, "3 min under" or "on target" (within 15 seconds, or 5 % of a long target). With a target for the play, a row at the top of the outline shows the whole play's runtime against it, and so does the status bar.

Targets live in the script, so they move with a scene and survive a renamed heading. The play's is a title-page key, `Target: 1 h 30 min`. A heading's is a note on the line under it (after any synopsis), `[[target: 10 min]]`. Neither prints, even with notes included, and neither counts as a change since a draft.

## Read-throughs

**Time read-through** times a reading scene by scene, starting at the scene the cursor is in. A strip at the top of the script shows the scene and how long it's taken. Tap **Next scene** as each scene ends (it brings the next scene's heading to the top), **Pause** for a break, and **Finish** at the end. **Go on to next scene in read-through**, **Pause or resume read-through** and **Finish read-through** are commands too, for hotkeys.

At the end, the times go in a note beside the script, `Play - Readings.md`, one section for each reading: the date, the draft, and each scene's time read against its estimate. Then you can adjust the runtime estimate to match. It scales the estimate by one factor: how much longer or shorter the scenes read than estimated. By words spoken, that changes words per minute and every pause word's times; by pages, minutes per page. Every script's runtime changes with it, and you can change the numbers back in Fountain Stage's settings.
