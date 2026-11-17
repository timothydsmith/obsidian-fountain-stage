# Changelog

All notable changes to Playwright are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

Add new entries under **Unreleased** as you work on `dev`, grouped as Added, Changed, Fixed or Removed. When you release, rename **Unreleased** to the version and date, and start a fresh **Unreleased** section above it. The full steps are in the README under [Branches and releases](README.md#branches-and-releases).

## [Unreleased]

### Added
- `.fountain` files open in Playwright's own editor.
- Formatting as you type, laid out as a stage play: act and scene headings centred, character cues centred, parentheticals and stage directions in italics, transitions to the right, and `*italic*`, `**bold**` and `_underline_` shown as they'll print. Forcing marks (`.`, `@`, `!`, `~`, `>`, `<`, `^`), section `#`s and emphasis markers stay visible but faint. Notes are highlighted and boneyard text is dimmed. The title page and any `***Characters***`-style breakdown sections are shown as such.
- The editor follows Obsidian's **Readable line length** setting.
- Line numbers for every line of a script, shown when Obsidian's **Settings → Editor → Show line number** is on, the same as for notes. Changing the setting updates open scripts straight away.
- **New script** command and ribbon button, which create `Untitled.fountain` in the folder Obsidian uses for new notes.
