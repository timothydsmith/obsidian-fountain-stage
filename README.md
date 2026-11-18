# Playwright

An [Obsidian](https://obsidian.md) plugin for writing scripts in [Fountain](https://fountain.io/syntax/), with formatting as you type, line numbers, and export to stage-play PDFs in a choice of house styles.

> **Status:** early development. Nothing is released yet. Right now `.fountain` files open in an editor that formats the script as you type, with line numbers, and scripts export to PDF in three built-in house styles. Your own styles and fonts come next.

Line numbers and line width follow Obsidian's own **Settings → Editor → Show line number** and **Readable line length**, so scripts and notes match.

## Planned for the first release

- Formatting as you type, following the Fountain spec.
- Line numbers for every line of the file, shown in the editor when Obsidian's **Show line number** setting is on.
- PDF export in stage-play house styles, ported from fountain2pdf:
  - **modern:** Dramatists Guild Modern Play Format
  - **apt:** Australian Plays Transform submission format
  - **samuel_french:** Samuel French / SFI submission format
- Your own styles, as JSON files in your vault that extend a built-in style and change only what differs.
- A `Style:` key on a script's title page that picks its export style. Without one, you pick a style when you export.
- Works on desktop and mobile.

## Install

Not released yet. To try a development build, see [Development](#development).

Playwright and the **Fountain** community plugin both open `.fountain` files, and only one plugin can do that at a time. Turn **Fountain** off in any vault where you use Playwright.

## Development

Needs Node.js 18 or later.

```sh
npm install
npm run dev    # watch build
npm test       # vitest
npm run build  # type-check and production build
```

To copy every build straight into a test vault, create a `.env` file in the project folder (it's ignored by git):

```
OBSIDIAN_VAULT=C:\path\to\test vault
```

Each build is then copied to `<vault>/.obsidian/plugins/playwright/`, along with a `.hotreload` marker file. With the [Hot Reload](https://github.com/pjeby/hot-reload) plugin installed in the test vault, Obsidian loads each new build by itself. Without it, turn Playwright off and on again after each build. Hot Reload ignores plugins that don't have the marker, so an old build keeps running until you reload.

Layout:

| Path | Purpose |
|---|---|
| `src/main.ts` | Plugin entry point: registers the view, commands and ribbon button |
| `src/editor/FountainView.ts` | The `.fountain` editor (CodeMirror 6) |
| `src/editor/formatting.ts` | Formatting as you type: re-parses on each change and styles each line |
| `src/fountain/parser.ts` | Fountain parser, ported from fountain2pdf, with source positions |
| `src/fountain/inline.ts` | Inline emphasis and links |
| `src/export.ts` | Export to PDF in Obsidian: style picker and saving the PDF |
| `src/pdf/style.ts` | The `PlayStyle` type: every setting a house style controls |
| `src/pdf/styles/` | The built-in styles |
| `src/pdf/layout.ts` | Turns a parsed script into pages, ported from fountain2pdf's engine |
| `src/pdf/paragraph.ts`, `blocks.ts`, `flow.ts` | Line breaking and pagination, matching reportlab's so pages break where fountain2pdf's did |
| `src/pdf/fonts.ts`, `render.ts` | Font metrics, and drawing the pages with pdf-lib |
| `src/files.ts` | File helpers, such as picking a name for a new script |
| `src/obsidianConfig.ts` | Reads Obsidian's editor settings, such as **Show line number** |
| `tests/` | vitest tests |

## Branches and releases

- **`dev`** is where work happens. Commit or merge feature branches here.
- **`main`** holds released versions only. Every commit on `main` is a release.

To cut a release:
1. On `dev`, move the **Unreleased** entries in [CHANGELOG.md](CHANGELOG.md) under a new version heading with today's date.
2. Bump `version` in `manifest.json` and `package.json`. Add the version to `versions.json`, mapped to `minAppVersion`.
3. Run `npm test` and `npm run build`, then commit.
4. Merge `dev` into `main`, and tag the merge with the bare version, e.g. `0.1.0`. Obsidian requires the tag to match `manifest.json` exactly, with no `v` prefix.
5. Push `main` and the tag. Then create a GitHub release for that tag, with that version's changelog section as its notes and `main.js`, `manifest.json` and `styles.css` attached.

## License

[MIT](LICENSE)
