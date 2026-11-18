/** Where you were in a script: the selection, and the line at the top of the view. Offsets into the text. */
export interface ScriptPosition {
  anchor: number;
  head: number;
  /** Offset of the start of the line shown at the top of the editor. */
  top: number;
}

export interface PositionStorage {
  load(): unknown;
  save(data: [string, ScriptPosition][]): void;
}

/** How many scripts to remember; the least recently used are forgotten first. */
export const MAX_POSITIONS = 300;
const SAVE_DELAY_MS = 1000;

function isPosition(value: unknown): value is ScriptPosition {
  const p = value as ScriptPosition;
  return typeof p === "object" && p !== null && [p.anchor, p.head, p.top].every((n) => Number.isInteger(n) && n >= 0);
}

/**
 * Remembers where you were in each script, by vault path, so switching
 * between files returns you to the same place. Kept per device, since a
 * position on a phone means little on a laptop.
 */
export class PositionStore {
  private positions = new Map<string, ScriptPosition>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private storage: PositionStorage) {
    const saved = storage.load();
    if (!Array.isArray(saved)) return;
    for (const entry of saved) {
      if (Array.isArray(entry) && typeof entry[0] === "string" && isPosition(entry[1])) {
        this.positions.set(entry[0], entry[1]);
      }
    }
  }

  get(path: string): ScriptPosition | undefined {
    return this.positions.get(path);
  }

  set(path: string, position: ScriptPosition): void {
    // Re-insert so the map stays in least-recently-used order.
    this.positions.delete(path);
    this.positions.set(path, position);
    while (this.positions.size > MAX_POSITIONS) {
      this.positions.delete(this.positions.keys().next().value!);
    }
    this.scheduleSave();
  }

  rename(oldPath: string, newPath: string): void {
    const position = this.positions.get(oldPath);
    if (!position) return;
    this.positions.delete(oldPath);
    this.set(newPath, position);
  }

  delete(path: string): void {
    if (this.positions.delete(path)) this.scheduleSave();
  }

  /** Writes any pending change now. */
  flush(): void {
    if (this.saveTimer === null) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.storage.save([...this.positions]);
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.storage.save([...this.positions]);
    }, SAVE_DELAY_MS);
  }
}
