import type { App, EventRef } from "obsidian";

/**
 * Obsidian's own editor settings (Settings → Editor), which live in the
 * vault config. `getConfig` and the `config-changed` event aren't in
 * Obsidian's public typings, so all access goes through this file.
 * Obsidian's markdown editor reads and listens to them the same way.
 */
interface VaultConfig {
  getConfig(key: string): unknown;
  on(name: "config-changed", callback: (key: string) => unknown): EventRef;
}

function vaultConfig(app: App): VaultConfig {
  return app.vault as unknown as VaultConfig;
}

/** Obsidian's "Show line number" setting. Off unless turned on. */
export function showLineNumbers(app: App): boolean {
  return vaultConfig(app).getConfig("showLineNumber") === true;
}

/** Calls `callback` with the key of each Obsidian setting that changes. */
export function onConfigChanged(app: App, callback: (key: string) => void): EventRef {
  return vaultConfig(app).on("config-changed", callback);
}
