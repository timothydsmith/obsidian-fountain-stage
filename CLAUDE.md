# Fountain Stage (obsidian-fountain-stage)

Obsidian plugin for Fountain (.fountain) scripts: formatted editing, line numbers, and stage-play PDF export ported from the Python project `../fountain2pdf`. The plugin replaces fountain2pdf as the main codebase.

## Workflow

- Work on `dev`. `main` is releases only; follow the release steps in README.md.
- Semantic versioning. Tags are the bare version (`0.1.0`), matching `manifest.json`.
- Add a CHANGELOG.md entry under **Unreleased** for every user-visible change.
- `npm test` and `npm run build` must pass before committing.

## Constraints

- **One play per vault.** Settings such as the drafts folder apply to the whole vault; there's no dashboard across several scripts.
- **Mobile is in scope** (`isDesktopOnly: false`). Don't use Node or Electron APIs, the system filesystem, or system font lookup. Use Obsidian's vault APIs only.
- **Editor settings follow Obsidian's**, not settings of our own. Line numbers use Obsidian's `showLineNumber`; the starting mode uses `defaultViewMode` and `livePreview`; mode hotkeys are those of Obsidian's own mode commands. Access to these unofficial vault-config APIs goes only through `src/obsidianConfig.ts`.
- **CodeMirror is provided by Obsidian.** `@codemirror/*` and `@lezer/*` are external in esbuild and must never be bundled.
- Published as a community plugin, so every release must still meet the rules: follow Obsidian's plugin guidelines (no `innerHTML` with user content, use `registerEvent`/`register*` for cleanup, sentence case in UI text, no "Obsidian" in the plugin name).
- Out of scope (don't build): rehearsal mode, snippets, filtering, dual dialogue in the editor (PDF export keeps it), boneyard features.
- **Links to vault notes** use the Fountain plugin's syntax, `[[>target]]` or `[[>target|display text]]`, so scripts move between the two plugins unchanged. Being notes to the parser, they can go anywhere, dialogue included, and print only with notes (as their display text). `src/fountain/links.ts` finds them.
- **Sections never print**, as the Fountain spec says. `#` sections are structure only (outline, runtime, report); printed act and scene titles come from scene headings, centred text and `===`.
- **Story beats and action beats** are sections: shallower than the **Action beats** setting (`##` by default) they're story beats, at it or deeper they're action beats, part of the scene they're in. `src/fountain/storyOutline.ts` builds the by-act and by-beat outlines; `buildOutline` in `outline.ts` stays as it was for the report, passes and checks.
- `ROADMAP.md` holds the release plan and the decisions behind each feature.

## Code

- **Commands are rows in one table**, `commandTable` in `main.ts`, registered by `src/commands.ts`: id, name, icon, when it applies, and any More options menu section. Add a command there, not with `addCommand`, so the palette and the menu can't drift apart. Ids never change once released, so hotkeys keep working.
- **Command names** follow the 1.0 rules: verbs first, no "a" or "the" ("Start sprint"), and toggles as "Toggle …" in the palette, shown without "Toggle" and ticked in menus. The rules and the renames are in ROADMAP.md.
- **Tabs that follow a script** (report, changes, checks, beat map) extend `ScriptTabView`.
- **Shared helpers:** line offsets and line endings through `src/fountain/lines.ts`, dates written out ("21 November 2026") through `longDate` in `titlePage.ts`, and whole-word matching (no regex lookbehind, for iOS) through `src/fountain/wholeWords.ts`.

## Parser

- `src/fountain/parser.ts` is a port of fountain2pdf's `parser.py` and is shared by the editor and the PDF export. It must keep producing the same elements as `parser.py` (it matched it exactly on 10 real scripts when ported). The intended differences: boneyard and notes are blanked, not cut, so source positions stay true; and the preface also ends at the first character cue, so a script needn't have a scene heading (but not at a cue-like line in a breakdown section's first block, such as a list of names under `***Characters***`).
- `fountain2pdf/sample.fountain` is a good manual test script.

## PDF export design

- Styles are plain data. Built-in styles (`modern`, `apt`, `samuel_french`) are TS modules; user styles are JSON files in a vault folder that `extends` another style and override only grouped camelCase fields (`character.bold`). Invalid style files report the field and reason.
- The engine has no style-specific logic. A new layout behaviour becomes a new style field whose default leaves existing styles unchanged.
- Layout (pages of positioned text) is separate from PDF drawing (pdf-lib), and layout output is snapshot-tested per style.
- Fonts come from files in the vault, falling back to the standard PDF fonts with a notice. Vault fonts are matched by the family, weight and italic flag inside the file, not the file name, and are embedded without ligatures or kerning, as reportlab drew them.
- Layout must keep matching fountain2pdf (reportlab): same page breaks and line positions. It matched on 3 scripts × 3 styles, and with real Palatino. The intended differences: list bullets use the body font, not Helvetica; sections never print (from 0.2.0), so parity doesn't cover them; and `Draft:` and `Draft date:` print in a title-page corner (`titlePage.draft`), not with the contact details.
- User style files: `src/pdf/userStyles.ts` holds the schema of every overridable setting. A new style field needs adding there and to the README's settings table.
- A title-page `Style:` key picks the export style and is never printed. Without one, the user picks on export. `Draft notes:` never prints either.
- Frozen drafts are the scripts in the drafts folder. Changes to the working file on freeze go through `FountainView.applyChanges`, so one undo puts them back.
