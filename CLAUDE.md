# Playwright (obsidian-playwright)

Obsidian plugin for Fountain (.fountain) scripts: formatted editing, line numbers, and stage-play PDF export ported from the Python project `../fountain2pdf`. The plugin replaces fountain2pdf as the main codebase.

## Workflow

- Work on `dev`. `main` is releases only; follow the release steps in README.md.
- Semantic versioning. Tags are the bare version (`0.1.0`), matching `manifest.json`.
- Add a CHANGELOG.md entry under **Unreleased** for every user-visible change.
- `npm test` and `npm run build` must pass before committing.

## Constraints

- **Mobile is in scope** (`isDesktopOnly: false`). Don't use Node or Electron APIs, the system filesystem, or system font lookup. Use Obsidian's vault APIs only.
- **Editor settings follow Obsidian's**, not settings of our own. Line numbers use Obsidian's `showLineNumber`. Access to these unofficial vault-config APIs goes only through `src/obsidianConfig.ts`.
- **CodeMirror is provided by Obsidian.** `@codemirror/*` and `@lezer/*` are external in esbuild and must never be bundled.
- Aiming to be a community plugin: follow Obsidian's plugin guidelines (no `innerHTML` with user content, use `registerEvent`/`register*` for cleanup, sentence case in UI text, no "Obsidian" in the plugin name).
- Out of scope (don't build): index cards, rehearsal mode, snippets, filtering, dual dialogue in the editor (PDF export keeps it), links, boneyard features, margin marks.

## PDF export design

- Styles are plain data. Built-in styles (`modern`, `apt`, `samuel_french`) are TS modules; user styles are JSON files in a vault folder that `extends` another style and override only grouped camelCase fields (`character.bold`). Invalid style files report the field and reason.
- The engine has no style-specific logic. A new layout behaviour becomes a new style field whose default leaves existing styles unchanged.
- Layout (pages of positioned text) is separate from PDF drawing (pdf-lib), and layout output is snapshot-tested per style.
- Fonts come from files in the vault, falling back to the standard PDF fonts with a notice.
- A title-page `Style:` key picks the export style and is never printed. Without one, the user picks on export.
