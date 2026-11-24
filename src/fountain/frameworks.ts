/**
 * Story frameworks: named sets of beats, each with a description and where
 * it usually falls, as a share of the runtime. They're written as notes:
 *
 *     # Three-act structure
 *     The play in three movements.
 *
 *     ## Inciting incident
 *     Position: 10%
 *     Something upsets the world of the play.
 *
 * The `#` heading names the framework (otherwise the file does), and each
 * `##` heading starts a beat. A `Position:` line gives where the beat falls;
 * the rest is its description. The built-in frameworks are written the
 * same way, in BUILT_IN_FRAMEWORKS.
 */

export interface FrameworkBeat {
  name: string;
  /** Where the beat usually falls, from 0 (the start) to 1 (the end). */
  position?: number;
  description: string;
}

export interface Framework {
  /** "built-in:<name>" or the note's path. */
  id: string;
  name: string;
  description: string;
  beats: FrameworkBeat[];
}

export type FrameworkResult = { framework: Framework } | { error: string };

const POSITION_RE = /^\s*position\s*:\s*(\d+(?:\.\d+)?)\s*%?\s*$/i;

function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, "");
}

/** Lines of text as one paragraph of description, with Markdown emphasis left out. */
function description(lines: string[]): string {
  return lines
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ")
    .replace(/(\*\*|__|\*|_)(.+?)\1/g, "$2")
    .trim();
}

/** A framework from the text of its note, or why it can't be read. */
export function parseFramework(text: string, id: string, fallbackName: string): FrameworkResult {
  let name = "";
  const intro: string[] = [];
  const beats: { name: string; position?: number; lines: string[]; line: number }[] = [];
  const lines = stripFrontmatter(text).split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const h1 = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    const h2 = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (h1 && !name && beats.length === 0) name = h1[1];
    else if (h2) beats.push({ name: h2[1], lines: [], line: n + 1 });
    else if (beats.length === 0) intro.push(line);
    else {
      const beat = beats[beats.length - 1];
      const position = POSITION_RE.exec(line);
      if (position && beat.position === undefined) {
        const value = Number(position[1]);
        if (value > 100) return { error: `The position of "${beat.name}" (line ${n + 1}) is more than 100%.` };
        beat.position = value / 100;
      } else {
        beat.lines.push(line);
      }
    }
  }
  if (beats.length === 0) return { error: "It has no beats. Start each beat with a ## heading." };
  return {
    framework: {
      id,
      name: name || fallbackName,
      description: description(intro),
      beats: beats.map((beat) => ({ name: beat.name, position: beat.position, description: description(beat.lines) })),
    },
  };
}

/** The frameworks that come with Fountain Stage, as notes. */
export const BUILT_IN_FRAMEWORKS: string[] = [
  `# Three-act structure
The play in three movements: a world set up, a struggle that builds, and how it comes out.

## Setup
Position: 0%
Who these people are, where we are, and what they want.

## Inciting incident
Position: 10%
Something upsets the way things are, and the play can't go back.

## First turning point
Position: 25%
The main character commits to a course, and the second act begins.

## Midpoint
Position: 50%
A win or a loss that changes what's at stake, often a revelation.

## Second turning point
Position: 75%
The lowest point, or a discovery that sends the play into its last act.

## Climax
Position: 90%
The decisive confrontation, where the question the play asked is answered.

## Resolution
Position: 97%
The new way things are, after the climax.`,

  `# Freytag's pyramid
Gustav Freytag's five parts of a drama, rising to a peak and falling away.

## Exposition
Position: 0%
The situation, the people and what's between them.

## Rising action
Position: 15%
Complications pile up and the conflict sharpens.

## Climax
Position: 50%
The turning point, where the main character's fortunes change.

## Falling action
Position: 65%
What follows from the turn, as the ending comes into sight.

## Catastrophe
Position: 90%
The outcome: the downfall in a tragedy, the untangling in a comedy.`,

  `# Story Spine
Kenn Adams's improvisers' outline of a story, a sentence for each step.

## Once upon a time
Position: 0%
The world of the play, as it's always been.

## Every day
Position: 5%
What normally happens there.

## But one day
Position: 12%
Something different happens.

## Because of that
Position: 25%
The first consequence.

## Because of that, again
Position: 40%
What that leads to.

## Because of that, and again
Position: 55%
And what that leads to, as things build.

## Until finally
Position: 80%
The climax, where it all comes to a head.

## And ever since then
Position: 95%
How things are now.`,

  `# Story Circle
Dan Harmon's eight steps around a circle: out into the unknown and back, changed.

## You
Position: 0%
A character in a place where they're comfortable.

## Need
Position: 12.5%
They want something.

## Go
Position: 25%
They go somewhere unfamiliar to get it.

## Search
Position: 37.5%
They adapt to it, and are tested.

## Find
Position: 50%
They get what they wanted.

## Take
Position: 62.5%
They pay a heavy price for it.

## Return
Position: 75%
They go back to where they started.

## Change
Position: 87.5%
They've changed, and so has their world.`,

  `# Kishōtenketsu
Four parts, from East Asian storytelling, that turn on a twist rather than a conflict.

## Ki: introduction
Position: 0%
The people and their world.

## Shō: development
Position: 25%
More of the same, deepened, with no great change.

## Ten: twist
Position: 50%
Something unexpected, seemingly unrelated, that shifts how we see it all.

## Ketsu: reconciliation
Position: 75%
The parts brought together, in a new understanding.`,

  `# Save the Cat
Blake Snyder's fifteen beats, made for screenplays and often used for plays.

## Opening image
Position: 0%
A picture of the main character's world before the story begins.

## Setup
Position: 1%
The main character's life, and what's missing from it.

## Theme stated
Position: 5%
Someone hints at what the story is really about.

## Catalyst
Position: 10%
The event that sets the story going.

## Debate
Position: 12%
The main character hesitates over what to do.

## Break into two
Position: 20%
They choose, and step into a new world.

## B story
Position: 22%
A second story, often a relationship, that carries the theme.

## Fun and games
Position: 25%
The promise of the premise: the new world explored.

## Midpoint
Position: 50%
A false victory or false defeat, and the stakes go up.

## Bad guys close in
Position: 55%
Pressure mounts, from outside and within.

## All is lost
Position: 75%
The lowest point, where something or someone is lost.

## Dark night of the soul
Position: 77%
The main character takes in the loss.

## Break into three
Position: 80%
A new idea, often from the B story, shows the way out.

## Finale
Position: 85%
The main character puts what they've learned to the test.

## Final image
Position: 99%
A picture that answers the opening image, showing the change.`,
];

/** The built-in frameworks, read. */
export function builtInFrameworks(): Framework[] {
  return BUILT_IN_FRAMEWORKS.map((text) => {
    const name = /^#\s+(.+)$/m.exec(text)?.[1] ?? "Framework";
    const result = parseFramework(text, `built-in:${name}`, name);
    if ("error" in result) throw new Error(`Built-in framework ${name}: ${result.error}`);
    return result.framework;
  });
}
