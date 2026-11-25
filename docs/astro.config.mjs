// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

const repo = "https://github.com/timothydsmith/obsidian-fountain-stage";

// Published on GitHub Pages at https://timothydsmith.github.io/obsidian-fountain-stage/
export default defineConfig({
  site: "https://timothydsmith.github.io",
  base: "/obsidian-fountain-stage",
  integrations: [
    starlight({
      title: "Fountain Stage",
      description: "An Obsidian plugin for writing stage plays in Fountain, and exporting them as PDFs in house styles.",
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "GitHub", href: repo }],
      editLink: { baseUrl: `${repo}/edit/dev/docs/` },
      lastUpdated: true,
      sidebar: [
        { label: "Getting started", items: ["install", "setting-up"] },
        {
          label: "Writing",
          items: ["editor", "outline-and-report", "runtime", "scenes", "story-outline", "linked-notes", "focus", "table-read"],
        },
        {
          label: "Rewriting",
          items: ["drafts", "cuts", "line-bank", "changes", "alternates", "passes", "checks", "cast"],
        },
        { label: "Printing", items: ["export", "styles", "fonts", "rehearsal-pages"] },
        {
          label: "Reference",
          items: ["commands", { label: "Changelog", link: `${repo}/blob/main/CHANGELOG.md`, attrs: { target: "_blank" } }],
        },
      ],
    }),
  ],
});
