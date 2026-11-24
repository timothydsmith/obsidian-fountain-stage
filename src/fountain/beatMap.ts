/**
 * The beat map's layout: the play as a timeline, left to right. Each scene
 * is a box as wide as it runs (or all the same width, as cards), with its
 * action beats inside it; story beats are bands over the scenes they hold;
 * acts are markers where they start. A beat with no scenes yet gets a box of
 * its own, so a plan shows before it's written.
 */

import type { OutlineItem } from "./outline";

export interface MapBox {
  item: OutlineItem;
  x: number;
  width: number;
}

export interface MapScene extends MapBox {
  runtime: number;
  actions: MapBox[];
}

export interface MapBeat extends MapBox {
  /** 0 for the outermost beats, 1 for beats inside them, and so on. */
  level: number;
  runtime: number;
  /** A beat with no scenes in it, which has a box of its own. */
  empty: boolean;
}

export interface BeatMapLayout {
  width: number;
  scenes: MapScene[];
  beats: MapBeat[];
  /** The number of rows of beats. */
  levels: number;
  acts: { item: OutlineItem; x: number }[];
  /** Where a moment of the play (in seconds) falls across the map. */
  xAt: (seconds: number) => number;
  /** Whether any scene has a runtime, so that xAt means something. */
  timed: boolean;
}

export interface BeatMapOptions {
  /** Every scene the same width, rather than by runtime. */
  equal: boolean;
  /** Pixels a second, by runtime. */
  scale: number;
  /** The narrowest a scene is drawn, by runtime. */
  minWidth: number;
  /** How wide each scene is, as cards. */
  cardWidth: number;
  /** How wide a beat with no scenes is, by runtime. */
  emptyWidth: number;
  /** Space between boxes. */
  gap: number;
}

interface Slot {
  /** A scene, or a beat with no scenes. */
  item: OutlineItem;
  x: number;
  width: number;
  start: number;
  runtime: number;
}

/**
 * Lays out a story outline by beat (see ./storyOutline), given each item's
 * runtime and the time each line starts at.
 */
export function layoutBeatMap(outline: OutlineItem[], runtimes: Map<OutlineItem, number>, at: (line: number) => number, options: BeatMapOptions): BeatMapLayout {
  const slots: Slot[] = [];
  const slotsOf = new Map<OutlineItem, Slot[]>();
  const beats: { item: OutlineItem; level: number }[] = [];
  const acts: OutlineItem[] = [];
  let x = 0;
  const place = (item: OutlineItem, min: number): Slot => {
    const runtime = runtimes.get(item) ?? 0;
    // A beat with no scenes, or a scene not written yet, has no runtime to size it by.
    const width = options.equal ? options.cardWidth : runtime > 0 && item.kind === "scene" ? Math.max(min, runtime * options.scale) : options.emptyWidth;
    const slot = { item, x, width, start: at(item.line), runtime };
    x += width + options.gap;
    slots.push(slot);
    return slot;
  };

  /** Places what's under a beat (or the top level), returning its slots. */
  const visit = (items: OutlineItem[], level: number): Slot[] => {
    const out: Slot[] = [];
    for (const item of items) {
      if (item.kind === "scene") out.push(place(item, options.minWidth));
      else if (item.kind === "act") acts.push(item);
      else if (item.kind === "section") {
        beats.push({ item, level });
        let inner = visit(item.children, level + 1);
        if (inner.length === 0) inner = [place(item, options.emptyWidth)];
        slotsOf.set(item, inner);
        out.push(...inner);
      }
      // Action beats outside a scene have no place on the map.
    }
    return out;
  };
  visit(outline, 0);
  const width = Math.max(x - options.gap, 0);

  const scenes: MapScene[] = slots
    .filter((slot) => slot.item.kind === "scene")
    .map((slot) => {
      const actions = slot.item.children.filter((child) => child.kind === "action");
      const boxes = actions.map((action, i): MapBox => {
        if (options.equal || slot.runtime <= 0) {
          const w = slot.width / actions.length;
          return { item: action, x: slot.x + i * w, width: w };
        }
        const from = slot.x + ((at(action.line) - slot.start) / slot.runtime) * slot.width;
        const runtime = runtimes.get(action) ?? 0;
        return { item: action, x: from, width: Math.max((runtime / slot.runtime) * slot.width, 0) };
      });
      return { item: slot.item, x: slot.x, width: slot.width, runtime: slot.runtime, actions: boxes };
    });

  const mapBeats: MapBeat[] = beats.map(({ item, level }) => {
    const inner = slotsOf.get(item) ?? [];
    const first = inner[0];
    const last = inner[inner.length - 1];
    return {
      item,
      level,
      x: first?.x ?? 0,
      width: first && last ? last.x + last.width - first.x : 0,
      runtime: runtimes.get(item) ?? 0,
      empty: inner.length === 1 && inner[0].item === item,
    };
  });

  const xAt = (seconds: number): number => {
    const timed = slots.filter((slot) => slot.item.kind === "scene");
    for (const slot of timed) {
      if (seconds < slot.start) return slot.x;
      if (seconds <= slot.start + slot.runtime) return slot.runtime > 0 ? slot.x + ((seconds - slot.start) / slot.runtime) * slot.width : slot.x;
    }
    return width;
  };

  return {
    width,
    scenes,
    beats: mapBeats,
    levels: beats.reduce((n, beat) => Math.max(n, beat.level + 1), 0),
    acts: acts.map((item) => ({ item, x: slots.find((slot) => slot.item.line > item.line)?.x ?? width })),
    xAt,
    timed: scenes.some((scene) => scene.runtime > 0),
  };
}
