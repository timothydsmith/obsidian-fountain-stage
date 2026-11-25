/**
 * Commands, described once. Each is registered in the command palette, and
 * those given a menu section also go in a script's More options menu, so a
 * command has the same name in both. A toggle is "Toggle typewriter mode" in
 * the palette and "Typewriter mode", ticked when on, in the menu, as
 * Obsidian does for reading view.
 */

import type { Menu, Plugin } from "obsidian";
import { FountainView } from "./editor/FountainView";

/** The sections of a script's More options menu, in order, after its modes. */
export const MENU_SECTIONS = ["drafts", "rehearsal", "cast", "panels", "focus"] as const;
export type MenuSection = (typeof MENU_SECTIONS)[number];

interface CommandBase {
  /** Never changes once released, so hotkeys people set keep working. */
  id: string;
  name: string;
  icon: string;
  /** Its section in a script's More options menu, if it goes there. */
  menu?: MenuSection;
  /** For a toggle: whether it's on, for the menu's tick. */
  isOn?: () => boolean;
}

/** A command that needs no script in front, such as New script. */
export interface AppCommand extends CommandBase {
  /** Whether it can run now, if not always: a table read that's going, say. */
  available?: () => boolean;
  run: () => void;
}

/** A command on the script in front. */
export interface ScriptCommand extends CommandBase {
  /** Whether it applies to a script; to every script, if left out. */
  appliesTo?: (view: FountainView) => boolean;
  run: (view: FountainView) => void;
}

export interface CommandTable {
  app: AppCommand[];
  script: ScriptCommand[];
}

/** A command's name in a menu: a toggle's without "Toggle". */
export function menuTitle(name: string): string {
  const rest = name.startsWith("Toggle ") ? name.slice("Toggle ".length) : name;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** Puts every command in the command palette. */
export function registerCommands(plugin: Plugin, table: CommandTable): void {
  for (const command of table.app) {
    plugin.addCommand({
      id: command.id,
      name: command.name,
      icon: command.icon,
      checkCallback: (checking) => {
        if (command.available && !command.available()) return false;
        if (!checking) command.run();
        return true;
      },
    });
  }
  for (const command of table.script) {
    plugin.addCommand({
      id: command.id,
      name: command.name,
      icon: command.icon,
      checkCallback: (checking) => {
        const view = plugin.app.workspace.getActiveViewOfType(FountainView);
        if (!view || (command.appliesTo && !command.appliesTo(view))) return false;
        if (!checking) command.run(view);
        return true;
      },
    });
  }
}

/** An item of a script's More options menu. */
export interface ScriptMenuItem {
  section: MenuSection;
  title: string;
  icon: string;
  checked?: boolean;
  run: () => void;
}

/** The commands that go in a script's More options menu and apply to it, by section. */
export function scriptMenuItems(table: CommandTable, view: FountainView): ScriptMenuItem[] {
  const items: ScriptMenuItem[] = [];
  const add = (command: CommandBase, run: () => void) => {
    if (!command.menu) return;
    items.push({ section: command.menu, title: menuTitle(command.name), icon: command.icon, checked: command.isOn?.(), run });
  };
  for (const command of table.app) if (!command.available || command.available()) add(command, () => command.run());
  for (const command of table.script) if (!command.appliesTo || command.appliesTo(view)) add(command, () => command.run(view));
  const order = (item: ScriptMenuItem) => MENU_SECTIONS.indexOf(item.section);
  // Sorted by section, keeping the table's order within each.
  return items.map((item, i) => ({ item, i })).sort((a, b) => order(a.item) - order(b.item) || a.i - b.i).map(({ item }) => item);
}

/**
 * Adds the items to a menu, each section apart. Obsidian puts sections it
 * doesn't know after all of its own, below Delete file; its undocumented
 * addSections slots them in before that danger section instead.
 */
export function addScriptMenuItems(menu: Menu, items: ScriptMenuItem[]): void {
  const sections = menu as Menu & { addSections?: (sections: string[]) => Menu };
  sections.addSections?.(MENU_SECTIONS.map((section) => `fountain-stage-${section}`));
  for (const item of items) {
    menu.addItem((menuItem) => {
      menuItem
        .setSection(`fountain-stage-${item.section}`)
        .setTitle(item.title)
        .setIcon(item.icon)
        .onClick(item.run);
      if (item.checked !== undefined) menuItem.setChecked(item.checked);
    });
  }
}
