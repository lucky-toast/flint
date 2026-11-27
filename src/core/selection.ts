// Pointing at the working slip: the preview-only instrumented template, and what Flint is told
// about a selection. Flint sees only the template (never the example orders or line numbers) and
// edits by exact find/replace, so a selection is described by the part's name and the clicked
// element's opening tag, copied from the template (Liquid included), plus which occurrence of that
// tag it is when the tag isn't unique. Nothing read from the rendered slip goes in.

import { countOccurrences } from "./edits";

/** The longest selection note: the app builds one that fits, and the Worker trims a longer one. */
export const MAX_SELECTION_LENGTH = 200;

/** The attribute that carries each opening tag's 1-based source line in the instrumented preview. */
export const LINE_ATTRIBUTE = "data-flint-line";

/** The attribute that carries each opening tag's 0-based position among the opening tags on its line. */
export const POSITION_ATTRIBUTE = "data-flint-position";

/** Liquid output and tags on one line, `{{ … }}` and `{% … %}`, captured so a split keeps them. */
const LIQUID_MARKUP = /(\{\{.*?\}\}|\{%.*?%\})/;

/** An opening tag's `<` and name, followed by whitespace, `>` or `/`. */
const OPENING_TAG = /<[a-zA-Z][a-zA-Z0-9]*(?=[\s>/])/g;

/** The opening tags on one line, outside its Liquid markup, in order: where each starts and its `<name`. */
function openingTags(line: string): { at: number; head: string }[] {
  const tags: { at: number; head: string }[] = [];
  let offset = 0;
  // Odd pieces are the Liquid markup on this line, skipped.
  line.split(LIQUID_MARKUP).forEach((piece, j) => {
    if (j % 2 === 0) for (const m of piece.matchAll(OPENING_TAG)) tags.push({ at: offset + m.index, head: m[0] });
    offset += piece.length;
  });
  return tags;
}

/**
 * A preview-only copy of the template in which every opening tag carries its 1-based source line
 * and its position among the line's opening tags. Never saved, downloaded or sent to Flint.
 */
export function instrumentSource(source: string): string {
  return source
    .split("\n")
    .map((line, i) => {
      let out = line;
      const tags = openingTags(line);
      // From the last tag back, so the earlier offsets still hold.
      for (let position = tags.length - 1; position >= 0; position--) {
        const end = tags[position]!.at + tags[position]!.head.length;
        out = `${out.slice(0, end)} ${LINE_ATTRIBUTE}="${i + 1}" ${POSITION_ATTRIBUTE}="${position}"${out.slice(end)}`;
      }
      return out;
    })
    .join("\n");
}

/**
 * Where the opening tag at `position` on `line` (1-based) starts and ends in `source`: up to its
 * closing `>`, past quoted attribute values and Liquid markup, across lines if need be.
 */
function openingTagAt(source: string, line: number, position: number): { start: number; end: number } | undefined {
  const lines = source.split("\n");
  const text = lines[line - 1];
  const tag = text === undefined ? undefined : openingTags(text)[position];
  if (!tag) return undefined;
  const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0) + tag.at;
  let quote: string | null = null;
  for (let at = start + tag.head.length; at < source.length; at++) {
    const c = source[at]!;
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "{" && (source[at + 1] === "{" || source[at + 1] === "%")) {
      const close = source.indexOf(source[at + 1] === "{" ? "}}" : "%}", at + 2);
      if (close === -1) break;
      at = close + 1;
    } else if (c === ">") {
      return { start, end: at + 1 };
    }
  }
  return { start, end: source.length };
}

export type SelectedPart = {
  /** The template the selection was made on. */
  source: string;
  /** The 1-based source line of the part's opening tag. */
  line: number;
  /** The 0-based position of the part's opening tag among the opening tags on that line. */
  position: number;
  /** What the seller sees on the chip, e.g. "SKU column". */
  name: string;
};

/** The longest part name a note quotes. */
const MAX_NAME_LENGTH = 40;

/**
 * What Flint is told about a selection, at most MAX_SELECTION_LENGTH characters: the part's name
 * and its opening tag copied from the template, plus which occurrence of that tag it is when the
 * template has it more than once. A tag too long to fit is trimmed, and the occurrence is counted
 * on the trimmed text, so it stays accurate for what's sent.
 */
export function selectionNote({ source, line, position, name }: SelectedPart): string {
  const selected = `Selected "${name.slice(0, MAX_NAME_LENGTH)}"`;
  const tag = openingTagAt(source, line, position);
  if (!tag) return `${selected}.`;

  // "Opening with" stays true for a trimmed tag, so every note has the same shape.
  const note = (quote: string) => {
    const total = countOccurrences(source, quote);
    const which = countOccurrences(source.slice(0, tag.start + quote.length), quote);
    const where = total > 1 ? `(occurrence ${which} of ${total} in the template)` : "in the template";
    return `${selected}, the element opening with \`${quote}\` ${where}.`;
  };

  let quote = source.slice(tag.start, tag.end);
  let text = note(quote);
  // Trim until it fits. A shorter quote can occur more often, so its counts are taken again each time.
  while (text.length > MAX_SELECTION_LENGTH && quote.length > 1) {
    quote = quote.slice(0, Math.max(1, quote.length - (text.length - MAX_SELECTION_LENGTH)));
    text = note(quote);
  }
  return text.slice(0, MAX_SELECTION_LENGTH);
}
