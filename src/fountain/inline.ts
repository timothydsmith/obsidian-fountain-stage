/**
 * Inline emphasis in Fountain text: `***bold italic***`, `**bold**`,
 * `*italic*`, `_underline_`, and markdown links `[text](url)`. A backslash
 * makes the next `*`, `_` or `\` literal.
 *
 * Follows fountain2pdf's render_inline: longer markers are matched before
 * shorter ones, matches are non-greedy, and emphasis can nest across kinds
 * (`**bold _and underlined_**`).
 */

export interface InlineRun {
  /** Offsets into the parsed text. */
  from: number;
  to: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  link?: string;
}

export interface InlineMarkup {
  /** The text to show, in order, split wherever its style changes. */
  runs: InlineRun[];
  /** The markup characters themselves: asterisks, underscores, backslashes and link syntax. */
  markers: { from: number; to: number }[];
}

const LINK_RE = /\[([^[\]]+)\]\((\S+?)\)/g;
const HIDDEN = "\u0001";

export function parseInline(text: string): InlineMarkup {
  const n = text.length;
  const isMarker = new Uint8Array(n);
  const isLiteral = new Uint8Array(n);
  const bold = new Uint8Array(n);
  const italic = new Uint8Array(n);
  const underline = new Uint8Array(n);
  const link = new Array<string | undefined>(n);

  /** The text with markup and escaped characters hidden, so later passes skip them. */
  const working = () => {
    let s = "";
    for (let i = 0; i < n; i++) s += isMarker[i] || isLiteral[i] ? HIDDEN : text[i];
    return s;
  };
  const mark = (from: number, to: number) => isMarker.fill(1, from, to);
  const flag = (flags: Uint8Array[], from: number, to: number) => {
    for (const f of flags) f.fill(1, from, to);
  };

  for (let i = 0; i < n - 1; i++) {
    if (text[i] === "\\" && "*_\\".includes(text[i + 1])) {
      isMarker[i] = 1;
      isLiteral[i + 1] = 1;
      i++;
    }
  }

  for (const m of working().matchAll(LINK_RE)) {
    const start = m.index;
    const textFrom = start + 1;
    const textTo = textFrom + m[1].length;
    const end = start + m[0].length;
    mark(start, textFrom);
    mark(textTo, end);
    const url = text.slice(textTo + 2, end - 1);
    for (let i = textFrom; i < textTo; i++) link[i] = url;
  }

  const pairs = (re: RegExp, width: number, flags: Uint8Array[]) => {
    for (const m of working().matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      mark(start, start + width);
      mark(end - width, end);
      flag(flags, start + width, end - width);
    }
  };
  pairs(/\*\*\*(.+?)\*\*\*/g, 3, [bold, italic]);
  pairs(/\*\*(.+?)\*\*/g, 2, [bold]);

  // Single asterisks pair up only when neither neighbour is another asterisk.
  const w = working();
  const lone: number[] = [];
  for (let i = 0; i < n; i++) {
    if (w[i] === "*" && w[i - 1] !== "*" && w[i + 1] !== "*") lone.push(i);
  }
  for (let k = 0; k + 1 < lone.length; k += 2) {
    mark(lone[k], lone[k] + 1);
    mark(lone[k + 1], lone[k + 1] + 1);
    flag([italic], lone[k] + 1, lone[k + 1]);
  }

  pairs(/_(.+?)_/g, 1, [underline]);

  const runs: InlineRun[] = [];
  const markers: { from: number; to: number }[] = [];
  let run: InlineRun | undefined;
  for (let i = 0; i < n; i++) {
    if (isMarker[i]) {
      run = undefined;
      const last = markers[markers.length - 1];
      if (last && last.to === i) last.to++;
      else markers.push({ from: i, to: i + 1 });
      continue;
    }
    const b = bold[i] === 1;
    const it = italic[i] === 1;
    const u = underline[i] === 1;
    if (run && run.bold === b && run.italic === it && run.underline === u && run.link === link[i]) {
      run.to++;
    } else {
      run = { from: i, to: i + 1, bold: b, italic: it, underline: u };
      if (link[i] !== undefined) run.link = link[i];
      runs.push(run);
    }
  }
  return { runs, markers };
}
