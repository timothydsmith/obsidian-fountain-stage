/**
 * Flows blocks down a page's text frame, starting new pages as needed.
 * Follows reportlab's Frame and DocTemplate so pages break where
 * fountain2pdf's did:
 *
 * - The frame is the page inside its margins, less 6pt of padding all round.
 * - A block's spaceBefore is dropped at the top of a page, and otherwise
 *   overlaps the previous block's spaceAfter (the larger wins).
 * - A block that doesn't fit is split; if it can't be, it moves to the next page.
 * - A page break always ends the page, but a trailing one adds no blank page.
 */

import { PAGE_BREAK, type Block, type Marks, type StoryItem } from "./blocks";
import { emptyPage, type LayoutPage } from "./model";
import { FUZZ } from "./paragraph";

export const FRAME_PADDING = 6;

export interface Frame {
  left: number;
  bottom: number;
  width: number;
  height: number;
}

export interface FlowResult {
  pages: LayoutPage[];
  /** Marks of the blocks placed, with the index of the page each landed on. */
  marks: { page: number; marks: Marks }[];
}

export function flow(story: StoryItem[], frame: Frame): FlowResult {
  const pages: LayoutPage[] = [];
  const marks: FlowResult["marks"] = [];
  const queue = story.slice();
  const postponed = new Set<Block>();

  const x = frame.left + FRAME_PADDING;
  const availWidth = frame.width - 2 * FRAME_PADDING;
  const floor = frame.bottom + FRAME_PADDING;
  const top = frame.bottom + frame.height - FRAME_PADDING;

  let page: LayoutPage | undefined;
  let y = top;
  let atTop = true;
  let prevSpaceAfter = 0;
  let placedOnPage = 0;

  const beginPage = () => {
    page = emptyPage();
    pages.push(page);
    y = top;
    atTop = true;
    prevSpaceAfter = 0;
    placedOnPage = 0;
  };
  const endPage = () => {
    page = undefined;
  };

  const spaceAbove = (block: Block) => (atTop ? 0 : Math.max(block.spaceBefore - prevSpaceAfter, 0));

  /** Places the block if it fits. With `force`, places it even if it overflows the page. */
  const add = (block: Block, force = false): boolean => {
    const s = spaceAbove(block);
    const room = y - floor - s;
    if (room <= 0 && !force) return false;
    const h = block.wrap(availWidth, atTop) + s;
    if (y - h < floor - FUZZ && !force) return false;
    let newY = y - h;
    block.draw(page!, x, newY);
    newY -= block.spaceAfter;
    prevSpaceAfter = block.spaceAfter;
    if (newY !== y) atTop = false;
    y = newY;
    placedOnPage++;
    if (block.marks) marks.push({ page: pages.length - 1, marks: block.marks });
    return true;
  };

  while (queue.length > 0) {
    if (!page) beginPage();
    const item = queue.shift()!;
    if (item === PAGE_BREAK) {
      endPage();
      continue;
    }
    if (add(item)) continue;

    const room = y - floor - spaceAbove(item);
    const parts = room > 0 ? item.split(availWidth, room) : [];
    if (parts.length > 0) {
      const [first, ...rest] = parts;
      if (item.marks && !first.marks) first.marks = item.marks;
      add(first, true);
      queue.unshift(...rest);
    } else if (postponed.has(item) || (atTop && placedOnPage === 0)) {
      // Too big for even an empty page: let it overflow rather than loop.
      add(item, true);
    } else {
      postponed.add(item);
      queue.unshift(item);
      endPage();
    }
  }

  if (pages.length === 0) pages.push(emptyPage());
  return { pages, marks };
}
