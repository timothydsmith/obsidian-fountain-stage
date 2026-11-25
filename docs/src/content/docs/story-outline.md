---
title: "Story outline"
description: "Planning a play in its outline: story beats, action beats, frameworks and the beat map."
---

Plan a play in its outline, and see its shape on a beat map. The structure lives in the script itself, as sections and scene headings, so the plan can't drift from what's written. Sections never print.

- **Story beats** are `#` sections: the play's structure, such as Setup or Catalyst. Each holds the scenes after it, up to the next beat. Story beats needn't line up with acts.
- **Action beats** are `##` sections inside a scene: units of action, which can start partway through it. They move with their scene.
- Which depth is which is the **Action beats** setting: `##` and deeper by default. Set it to `###` and deeper to use `##` sections as beats inside beats.

**By act and by beat.** The buttons at the top of the outline switch between the two views of the script. By act shows acts, then scenes, then action beats. By beat shows story beats, then scenes, then action beats, with each act as a divider where it starts.

**Planning.** The **+** button at the top of the outline adds a beat (by beat) or a scene (by act) at the end of the script. Right-click a row, or press and hold it on a phone, for more:

- **Add scene to this beat** (or act), **Add beat after**, **Add scene after** and **Add action beat** put a heading, with a synopsis if you give one, into the script in that place. A scene heading that doesn't start like INT. or EXT. is forced with a full stop.
- **Add synopsis** or **Edit synopsis** writes the `= …` line under the heading.
- **Create linked note** makes a note for a beat or scene in the beat notes folder (`Notes` unless you change it in settings), named like `Beat - Catalyst`, and links it under the heading as `[[>Beat - Catalyst]]`. A row with a note has an icon that opens it. **Open linked note** does the same.

Drag a beat to move it with everything it holds, or a scene to move it with its action beats; drop a scene on a beat to move it into that beat. **Add beat**, **Add scene**, **Edit synopsis** and **Create or open linked note** in the command palette work on the beat or scene at the cursor.

**Frameworks.** **Import framework**, in the command palette or at the top of the outline, inserts a framework's beats at the cursor (after the paragraph it's in) as empty beats, each with a short description as its synopsis, and names the framework on the title page with a `Framework:` key, which never prints. Built in: three-act structure, Freytag's pyramid, Story Spine, Story Circle, Kishōtenketsu and Save the Cat. Add your own as notes in the frameworks folder (`Fountain Stage/Frameworks` unless you change it in settings):

```markdown
# My structure
A short description of the framework.

## Opening
Position: 0%
What the opening does.

## Turn
Position: 50%
What happens at the turn.
```

The `#` heading names the framework (otherwise the note does). Each `##` heading is a beat; `Position:` says where it usually falls, as a share of the runtime, and the rest is its description.

**The beat map.** **Show beat map**, in the command palette or at the top of the outline, opens the script as a timeline, left to right, in a tab below it. Scenes are cards as wide as they run, with their synopsis and runtime and their action beats along the bottom. Story beats are bands above the scenes they hold, and acts are marked where they start. A beat with no scenes yet, or a scene with nothing written in it yet, gets a card of its own. Zoom in and out with the buttons, or tick **Equal widths** to make every scene the same width and use the map as a card board. **Mark beats of** marks where a framework's beats usually fall (the script's `Framework:` to start with); hover over a beat band to see where it starts against the framework. Drag cards and bands to move scenes and beats, and click one to go there. Drag and drop don't work on phones and tablets.
