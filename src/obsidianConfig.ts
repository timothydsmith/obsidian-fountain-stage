import type { App, EventRef, Hotkey } from "obsidian";

/**
 * Obsidian's own editor settings (Settings → Editor), which live in the
 * vault config, and the hotkeys of Obsidian's own commands. `getConfig`,
 * the `config-changed` event and the hotkey manager aren't in Obsidian's
 * public typings, so all access goes through this file. Obsidian's
 * markdown editor reads and listens to them the same way.
 */
interface VaultConfig {
  getConfig(key: string): unknown;
  on(name: "config-changed", callback: (key: string) => unknown): EventRef;
}

interface HotkeyManager {
  getHotkeys?(commandId: string): Hotkey[] | undefined;
  getDefaultHotkeys?(commandId: string): Hotkey[] | undefined;
}

function vaultConfig(app: App): VaultConfig {
  return app.vault as unknown as VaultConfig;
}

/** Obsidian's "Show line number" setting. Off unless turned on. */
export function showLineNumbers(app: App): boolean {
  return vaultConfig(app).getConfig("showLineNumber") === true;
}

/** Obsidian's "Readable line length" setting. On unless turned off. */
export function readableLineLength(app: App): boolean {
  return vaultConfig(app).getConfig("readableLineLength") !== false;
}

/** Obsidian's "Default view for new tabs" setting: editing ("source") unless set to reading. */
export function defaultViewMode(app: App): "source" | "preview" {
  return vaultConfig(app).getConfig("defaultViewMode") === "preview" ? "preview" : "source";
}

/** Obsidian's "Default editing mode" setting: Live Preview unless set to source mode. */
export function livePreview(app: App): boolean {
  return vaultConfig(app).getConfig("livePreview") !== false;
}

/** Calls `callback` with the key of each Obsidian setting that changes. */
export function onConfigChanged(app: App, callback: (key: string) => void): EventRef {
  return vaultConfig(app).on("config-changed", callback);
}

/** The hotkeys of one of Obsidian's commands, as you've set them or by default. */
export function hotkeysOf(app: App, commandId: string): Hotkey[] {
  const manager = (app as unknown as { hotkeyManager?: HotkeyManager }).hotkeyManager;
  return manager?.getHotkeys?.(commandId) ?? manager?.getDefaultHotkeys?.(commandId) ?? [];
}
