import esbuild from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join } from "node:path";

const prod = process.argv[2] === "production";
const PLUGIN_FILES = ["main.js", "manifest.json", "styles.css"];

/**
 * The test vault to copy each build into, from OBSIDIAN_VAULT in the
 * environment or in a `.env` file (`OBSIDIAN_VAULT=C:\path\to\vault`).
 */
function testVault() {
  if (process.env.OBSIDIAN_VAULT) return process.env.OBSIDIAN_VAULT;
  if (!existsSync(".env")) return null;
  const match = readFileSync(".env", "utf8").match(/^\s*OBSIDIAN_VAULT\s*=\s*(.+?)\s*$/m);
  return match ? match[1].replace(/^["']|["']$/g, "") : null;
}

/**
 * Copies the built plugin into the test vault after every successful build.
 * Also adds the `.hotreload` marker, without which the Hot Reload plugin
 * ignores the folder and Obsidian keeps running the previous build.
 */
const copyToVault = {
  name: "copy-to-vault",
  setup(build) {
    const vault = testVault();
    if (!vault) return;
    const id = JSON.parse(readFileSync("manifest.json", "utf8")).id;
    const dir = join(vault, ".obsidian", "plugins", id);
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      mkdirSync(dir, { recursive: true });
      for (const file of PLUGIN_FILES) copyFileSync(file, join(dir, file));
      const marker = join(dir, ".hotreload");
      if (!existsSync(marker)) writeFileSync(marker, "");
      console.log(`[copy-to-vault] copied to ${dir}`);
    });
  },
};

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // Obsidian provides these at runtime; bundling a second copy of
  // CodeMirror breaks its editor extensions.
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  plugins: [copyToVault],
});

if (prod) {
  await ctx.rebuild();
  await ctx.dispose();
} else {
  await ctx.watch();
}
