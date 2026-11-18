/**
 * Fonts from the vault: reading font files and choosing the four faces of
 * a family. Faces are told apart by what the font files say about
 * themselves (family, weight and italic), not by file name, so any
 * .ttf or .otf files can go in the fonts folder.
 */

import fontkit from "@pdf-lib/fontkit";
import type { Face } from "./style";

export interface FontInfo {
  path: string;
  family: string;
  /** 100 to 900; 400 is regular and 700 bold. */
  weight: number;
  italic: boolean;
  bytes: Uint8Array;
}

export const FONT_EXTENSIONS = ["ttf", "otf"];

interface FontkitFont {
  familyName: string | null;
  subfamilyName: string | null;
  italicAngle: number;
  "OS/2"?: { usWeightClass?: number; fsSelection?: { italic?: boolean } };
  getName?(key: string): string | null;
}

/** Reads what a font file says about itself, or explains why it can't be used. */
export function describeFont(path: string, bytes: Uint8Array): FontInfo | string {
  let font: FontkitFont & { fonts?: unknown[] };
  try {
    font = fontkit.create(bytes) as unknown as FontkitFont & { fonts?: unknown[] };
  } catch {
    return "isn't a font file Playwright can read";
  }
  if (Array.isArray(font.fonts)) return "is a font collection (.ttc), which can't be embedded. Use separate .ttf or .otf files";
  const family = (font.getName?.("preferredFamily") || font.familyName || "").trim();
  if (!family) return "has no family name";
  const sub = font.subfamilyName ?? "";
  const os2 = font["OS/2"];
  const weight = os2?.usWeightClass || (/bold|black|heavy/i.test(sub) ? 700 : 400);
  const italic = !!os2?.fsSelection?.italic || font.italicAngle !== 0 || /italic|oblique/i.test(sub);
  return { path, family, weight, italic, bytes };
}

export interface ChosenFamily {
  family: string;
  faces: Record<Face, FontInfo>;
  /** Faces the family doesn't have, filled in from its nearest face. */
  missing: Face[];
}

const TARGETS: Record<Face, { weight: number; italic: boolean }> = {
  regular: { weight: 400, italic: false },
  bold: { weight: 700, italic: false },
  italic: { weight: 400, italic: true },
  boldItalic: { weight: 700, italic: true },
};

/**
 * Picks the first of `wanted` that the fonts include. A wanted name matches
 * a family of that name, or failing that one it starts ("Palatino" finds
 * "Palatino Linotype").
 */
export function chooseFamily(fonts: readonly FontInfo[], wanted: readonly string[]): ChosenFamily | undefined {
  for (const name of wanted) {
    const n = name.toLowerCase();
    let matches = fonts.filter((f) => f.family.toLowerCase() === n);
    if (matches.length === 0) {
      const prefixed = fonts.filter((f) => f.family.toLowerCase().startsWith(n));
      const shortest = prefixed.map((f) => f.family).sort((a, b) => a.length - b.length)[0];
      matches = prefixed.filter((f) => f.family === shortest);
    }
    if (matches.length === 0) continue;

    const faces = {} as Record<Face, FontInfo>;
    const missing: Face[] = [];
    for (const face of Object.keys(TARGETS) as Face[]) {
      const target = TARGETS[face];
      const score = (f: FontInfo) => (f.italic === target.italic ? 0 : 1000) + Math.abs(f.weight - target.weight);
      const best = matches.slice().sort((a, b) => score(a) - score(b))[0];
      faces[face] = best;
      const boldEnough = target.weight >= 600 ? best.weight >= 600 : best.weight < 600;
      if (best.italic !== target.italic || !boldEnough) missing.push(face);
    }
    return { family: matches[0].family, faces, missing };
  }
  return undefined;
}

/** The families in a set of fonts, each with its faces, for listing in settings. */
export function listFamilies(fonts: readonly FontInfo[]): { family: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const f of fonts) counts.set(f.family, (counts.get(f.family) ?? 0) + 1);
  return [...counts].map(([family, count]) => ({ family, count })).sort((a, b) => a.family.localeCompare(b.family));
}
