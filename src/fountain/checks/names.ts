/**
 * Name consistency: cues that look like one character spelt two ways,
 * people in the Characters list who never speak, and speakers missing from
 * the list.
 */

import { cueName, listName } from "../characters";
import { matchBreakdownHeading, type ParsedScript } from "../parser";
import { lineStarts } from "../lines";
import type { Finding } from "./findings";

/** Cues for several people at once, which aren't characters of their own. */
const GROUP_CUES = new Set(["ALL", "BOTH", "EVERYONE", "EVERYBODY", "TOGETHER", "OMNES", "ALL TOGETHER", "VOICES", "CROWD"]);

/** Titles that don't make a name: SMITH and MRS SMITH share a surname, but MRS and MR SMITH aren't one person. */
const TITLES = new Set(["MR", "MRS", "MS", "MISS", "DR", "SIR", "LADY", "LORD", "MADAM", "MADAME", "UNCLE", "AUNT", "AUNTIE", "OLD", "YOUNG", "LITTLE", "BIG"]);

/** Common short forms of English names, each with the names it shortens. */
const NICKNAMES: Record<string, string[]> = {
  MARGARET: ["MAGGIE", "MAG", "MEG", "PEGGY", "PEG", "MADGE", "GRETA", "MAISIE"],
  ROBERT: ["BOB", "BOBBY", "ROB", "ROBBIE", "BERT"],
  WILLIAM: ["BILL", "BILLY", "WILL", "WILLIE", "WILLY", "LIAM"],
  ELIZABETH: ["LIZ", "LIZZIE", "LIZZY", "BETH", "BETTY", "BETSY", "ELIZA", "LIZA", "LISA", "LIBBY", "BESS", "BESSIE", "ELSIE"],
  JAMES: ["JIM", "JIMMY", "JAMIE"],
  KATHERINE: ["KATE", "KATIE", "KATHY", "KAT", "KITTY"],
  CATHERINE: ["CATH", "CATHY", "CATE", "KATE", "KATIE"],
  THOMAS: ["TOM", "TOMMY"],
  RICHARD: ["DICK", "RICK", "RICKY", "RICH", "RICHIE"],
  MICHAEL: ["MIKE", "MICK", "MICKEY", "MIKEY"],
  DAVID: ["DAVE", "DAVY", "DAVIE"],
  SUSAN: ["SUE", "SUSIE", "SUZY"],
  JENNIFER: ["JEN", "JENNY", "JENNI"],
  ALEXANDER: ["ALEX", "SANDY", "ALEC", "XANDER", "SASHA"],
  ALEXANDRA: ["ALEX", "SANDRA", "SASHA", "LEXI"],
  SAMUEL: ["SAM", "SAMMY"],
  SAMANTHA: ["SAM", "SAMMY"],
  BENJAMIN: ["BEN", "BENNY", "BENJI"],
  DANIEL: ["DAN", "DANNY"],
  NICHOLAS: ["NICK", "NICKY"],
  CHRISTOPHER: ["CHRIS", "KIT"],
  CHRISTINE: ["CHRIS", "CHRISSIE", "TINA"],
  PATRICK: ["PAT", "PADDY"],
  PATRICIA: ["PAT", "PATTY", "TRISH", "TRICIA"],
  ANTHONY: ["TONY"],
  JOSEPH: ["JOE", "JOEY", "JO"],
  MATTHEW: ["MATT", "MATTY"],
  ANDREW: ["ANDY", "DREW"],
  PETER: ["PETE"],
  STEPHEN: ["STEVE", "STEVIE"],
  STEVEN: ["STEVE", "STEVIE"],
  EDWARD: ["ED", "EDDIE", "TED", "TEDDY", "NED"],
  HENRY: ["HARRY", "HAL", "HANK"],
  JOHN: ["JOHNNY", "JACK", "JON"],
  MARY: ["MOLLY", "POLLY", "MAE"],
  ANNE: ["ANNIE", "NAN", "NANCY"],
  FRANCES: ["FRAN", "FRANNIE", "FANNY"],
  FRANCIS: ["FRANK", "FRANKIE"],
  GERALD: ["GERRY", "JERRY"],
  LEONARD: ["LEN", "LENNY", "LEO"],
  VICTORIA: ["VICKY", "VIC", "TORI"],
  DOROTHY: ["DOT", "DOTTIE", "DOLLY"],
  REBECCA: ["BECKY", "BEX", "BECCA"],
  DEBORAH: ["DEB", "DEBBIE"],
  JOSHUA: ["JOSH"],
  NATHANIEL: ["NAT", "NATE"],
  ZACHARY: ["ZACH", "ZAC"],
};

const nicknameOf = new Map<string, Set<string>>();
for (const [full, shorts] of Object.entries(NICKNAMES)) {
  for (const s of shorts) {
    if (!nicknameOf.has(s)) nicknameOf.set(s, new Set());
    nicknameOf.get(s)!.add(full);
  }
}

/** The name with full stops and apostrophes taken out and spaces evened. */
const plain = (name: string) => name.replace(/[.'’]/g, "").replace(/\s+/g, " ").trim();

/** Edits (letters put in, taken out or changed) to turn a into b. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

/** Why two names might be one character, or undefined if they don't look alike. */
export function alike(a: string, b: string): string | undefined {
  const pa = plain(a);
  const pb = plain(b);
  if (pa === pb) return "written two ways";
  const wa = pa.split(" ");
  const wb = pb.split(" ");
  // Different titles make different people: MR SMITH and MRS SMITH.
  if (TITLES.has(wa[0]) && TITLES.has(wb[0]) && wa[0] !== wb[0]) return undefined;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const named = short.filter((w) => !TITLES.has(w));
  if (named.length > 0 && short.length < long.length && short.every((w) => long.includes(w))) return "one name is part of the other";
  // A short form of the first name, the rest the same.
  if (wa.slice(1).join(" ") === wb.slice(1).join(" ")) {
    const [fa, fb] = [wa[0], wb[0]];
    if (nicknameOf.get(fa)?.has(fb) || nicknameOf.get(fb)?.has(fa)) return "one may be a short form of the other";
  }
  // Nearly the same spelling. One letter more or less (JON, JOHN) counts in names of three letters or more,
  // a changed letter only in longer names, as TOM and TIM are often two people.
  const d = distance(pa, pb);
  const shorter = Math.min(pa.length, pb.length);
  if (d === 1 && (pa.length !== pb.length ? shorter >= 3 : shorter >= 5)) return "spelt nearly the same";
  if (d === 2 && shorter >= 7) return "spelt nearly the same";
  return undefined;
}

interface Cued {
  speeches: number;
  firstLine: number;
  /** Where the first cue's name is, to mark it. */
  from: number;
  to: number;
}

/** The names in a cue: one, or each of several joined with "and", "&" or "/". */
function cueNames(text: string): string[] {
  const name = cueName(text).toUpperCase();
  return name
    .split(/\s*(?:&|\/|\bAND\b|\+)\s*/)
    .map((n) => n.trim())
    .filter(Boolean);
}

/**
 * The Characters list, by name, with the line each is on: from the title
 * page, or a Characters section before the play (under "# Characters").
 */
/**
 * A title page Characters line that lists several names ("ANNA, TOM and
 * CAROLINE") as each name; any other line ("ANNA, his sister") as it is.
 */
export function namesOnOneLine(value: string): string[] {
  const parts = value.split(/,|\s+(?:and|&)\s+/i).map((p) => p.trim());
  const name = (p: string) => p !== "" && p.split(/\s+/).length <= 4 && p.split(/\s+/).every((w) => /^\p{Lu}/u.test(w));
  if (parts.length > 1 && parts.every(name)) return parts.map((p) => p.toUpperCase());
  return value.trim() ? [value] : [];
}

function listedNames(script: ParsedScript, lines: string[]): Map<string, number> {
  const listed = new Map<string, number>();
  const add = (entry: string, line: number) => {
    const name = listName(entry);
    if (name && /\p{L}/u.test(name) && !listed.has(name)) listed.set(name, line);
  };
  for (const entry of script.titlePage) {
    if (entry.key !== "characters") continue;
    entry.values.forEach((value, k) => {
      for (const part of namesOnOneLine(value)) add(part, entry.line + k);
    });
  }
  let inList = false;
  for (const [line, role] of [...script.lineRoles].sort((x, y) => x[0] - y[0])) {
    if (role === "breakdown-heading") inList = matchBreakdownHeading(lines[line] ?? "") === "characters";
    else if (role === "breakdown" && inList) add(lines[line] ?? "", line);
  }
  return listed;
}

export function checkNames(source: string, script: ParsedScript): Finding[] {
  const lines = source.split("\n");
  const starts = lineStarts(source);
  const listed = listedNames(script, lines);

  const cued = new Map<string, Cued>();
  for (const el of script.elements) {
    if (el.type !== "character") continue;
    for (const name of cueNames(el.text)) {
      const c = cued.get(name);
      if (c) c.speeches++;
      else {
        const at = lines[el.line].toUpperCase().indexOf(name);
        const from = at >= 0 ? starts[el.line] + at : el.from;
        cued.set(name, { speeches: 1, firstLine: el.line, from, to: at >= 0 ? from + name.length : el.to });
      }
    }
  }

  const findings: Finding[] = [];
  const speakers = [...cued.keys()].filter((n) => !GROUP_CUES.has(n));
  const names = [...new Set([...speakers, ...listed.keys()])].sort();
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const [a, b] = [names[i], names[j]];
      // Two names only in the list are the writer's choice; it takes a speech to go wrong.
      if (!cued.has(a) && !cued.has(b)) continue;
      const why = alike(a, b);
      if (!why) continue;
      const count = (n: string) => {
        const s = cued.get(n)?.speeches ?? 0;
        return s === 0 ? "no speeches" : s === 1 ? "1 speech" : `${s} speeches`;
      };
      // Go to the likelier slip: the rarer name that speaks, or the one missing from the list.
      const slip = (n: string) => [cued.has(n) ? 0 : 1, cued.get(n)?.speeches ?? 0, listed.has(n) ? 1 : 0];
      const [sa, sb] = [slip(a), slip(b)];
      const k = sa.findIndex((v, i) => v !== sb[i]);
      const rarer = k >= 0 && sb[k] < sa[k] ? b : a;
      const at = cued.get(rarer);
      findings.push({
        check: "names",
        key: `names:alike:${a}|${b}`,
        line: at?.firstLine ?? listed.get(rarer) ?? 0,
        message: `${a} and ${b} may be one character (${why}). ${a} has ${count(a)}, ${b} ${count(b)}.`,
        marks: at ? [{ from: at.from, to: at.to }] : undefined,
      });
    }
  }

  if (listed.size > 0) {
    for (const [name, line] of listed) {
      if (cued.has(name)) continue;
      findings.push({ check: "names", key: `names:silent:${name}`, line, message: `${name} is in the Characters list but never speaks.` });
    }
    for (const name of speakers) {
      if (listed.has(name)) continue;
      const c = cued.get(name)!;
      findings.push({
        check: "names",
        key: `names:unlisted:${name}`,
        line: c.firstLine,
        message: `${name} speaks but isn't in the Characters list.`,
        marks: [{ from: c.from, to: c.to }],
      });
    }
  }
  return findings;
}
