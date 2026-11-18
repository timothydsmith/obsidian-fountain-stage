import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_POSITIONS, PositionStore, type ScriptPosition } from "../src/editor/positions";

const at = (n: number): ScriptPosition => ({ anchor: n, head: n, top: n });

function memoryStorage(initial: unknown = null) {
  const storage = { data: initial, saves: 0, load: () => storage.data, save: (d: unknown) => ((storage.data = d), storage.saves++) };
  return storage;
}

describe("PositionStore", () => {
  beforeEach(() => {
    // The store uses window's timers, as Obsidian asks; in Node, window is the global object.
    vi.stubGlobal("window", globalThis);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("remembers positions and saves them shortly after a change", () => {
    const storage = memoryStorage();
    const store = new PositionStore(storage);
    store.set("a.fountain", at(10));
    store.set("b.fountain", at(20));
    expect(store.get("a.fountain")).toEqual(at(10));
    expect(storage.saves).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(storage.saves).toBe(1);
    expect(new PositionStore(storage).get("b.fountain")).toEqual(at(20));
  });

  it("writes straight away on flush", () => {
    const storage = memoryStorage();
    const store = new PositionStore(storage);
    store.set("a.fountain", at(1));
    store.flush();
    expect(storage.saves).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(storage.saves).toBe(1);
  });

  it("follows renames and forgets deleted files", () => {
    const store = new PositionStore(memoryStorage());
    store.set("old.fountain", at(5));
    store.rename("old.fountain", "new.fountain");
    expect(store.get("old.fountain")).toBeUndefined();
    expect(store.get("new.fountain")).toEqual(at(5));
    store.delete("new.fountain");
    expect(store.get("new.fountain")).toBeUndefined();
  });

  it("forgets the least recently used scripts beyond the limit", () => {
    const store = new PositionStore(memoryStorage());
    for (let i = 0; i < MAX_POSITIONS; i++) store.set(`${i}.fountain`, at(i));
    store.set("0.fountain", at(0)); // used again, so now the most recent
    store.set("extra.fountain", at(1));
    expect(store.get("0.fountain")).toBeDefined();
    expect(store.get("1.fountain")).toBeUndefined();
    expect(store.get("extra.fountain")).toBeDefined();
  });

  it("ignores saved data it doesn't recognise", () => {
    const store = new PositionStore(memoryStorage([["a.fountain", at(3)], ["b.fountain", { anchor: -1 }], "junk"]));
    expect(store.get("a.fountain")).toEqual(at(3));
    expect(store.get("b.fountain")).toBeUndefined();
    expect(new PositionStore(memoryStorage({ not: "a list" })).get("a.fountain")).toBeUndefined();
  });
});
