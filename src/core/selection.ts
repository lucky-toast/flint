// Pointing at the working slip: the preview-only instrumented template, and what Flint is told
// about a selection. Flint sees only the template (never the example orders or line numbers) and
// edits by exact find/replace, so a selection is described by the part's name and its template
// code, quoted verbatim and made unique the way an edit's `find` must be.

import { countOccurrences } from "./edits";

/** The longest selection note the Worker passes on; a longer one is trimmed. */
export const MAX_SELECTION_LENGTH = 2000;

/** The attribute that carries each opening tag's 1-based source line in the instrumented preview. */
export const LINE_ATTRIBUTE = "data-flint-line";

/**
 * A preview-only copy of the template in which every opening tag carries its 1-based source line.
 * Never saved, downloaded or sent to Flint.
 */
export function instrumentSource(source: string): string {
  return source
    .split("\n")
    .map((line, i) =>
      // Odd pieces are the Liquid markup on this line, left as it is.
      line
        .split(LIQUID_MARKUP)
        .map((piece, j) => (j % 2 ? piece : piece.replace(/<([a-zA-Z][a-zA-Z0-9]*)(?=[\s>/])/g, `<$1 ${LINE_ATTRIBUTE}="${i + 1}"`)))
        .join(""),
    )
    .join("\n");
}

/** Liquid output and tags on one line, `{{ … }}` and `{% … %}`, captured so a split keeps them. */
const LIQUID_MARKUP = /(\{\{.*?\}\}|\{%.*?%\})/;

/**
 * The shortest run of lines from `line` (1-based) whose text occurs once in the template, if one
 * fits in `max` characters: the same uniqueness an edit's `find` needs.
 */
export function uniqueQuote(source: string, line: number, max = MAX_SELECTION_LENGTH): string | undefined {
  const lines = source.split("\n");
  const start = line - 1;
  for (let end = start; end < lines.length; end++) {
    const quote = lines.slice(start, end + 1).join("\n");
    if (quote.length > max) return undefined;
    if (countOccurrences(source, quote) === 1) return quote;
  }
  return undefined;
}

export type SelectedPart = {
  /** The template the selection was made on. */
  source: string;
  /** The part's 1-based source line (where its opening tag is). */
  line: number;
  /** What the seller sees on the chip, e.g. "SKU column". */
  name: string;
  /** Whether that line renders more than one element on the slip (say, a column in every item row). */
  repeats?: boolean;
};

/** The line Flint is told about a selection: its name and its template code, quoted so it occurs once. */
export function selectionNote({ source, line, name, repeats }: SelectedPart): string {
  const lines = source.split("\n");
  const intro = `The seller selected the "${name.slice(0, 80)}" part of the slip. In the template it is:`;
  const repeat = repeats ? "\nThe template repeats it, so it appears more than once on the slip." : "";
  const fence = (code: string) => `${intro}\n\`\`\`liquid\n${code}\n\`\`\`${repeat}`;
  const budget = MAX_SELECTION_LENGTH - fence("").length;

  const quote = uniqueQuote(source, line, budget);
  if (quote !== undefined) return fence(quote);

  // No unique run of lines fits: quote the line and say which of its occurrences the seller means.
  // The counts are of the quote actually sent, so room is kept for them at their widest.
  const where = (total: number, which: number) =>
    `\nThat code occurs ${total} times in the template; the seller means occurrence ${which}, counting from the top.`;
  const widest = Number("9".repeat(String(source.length).length));
  const sent = (lines[line - 1] ?? "").slice(0, budget - where(widest, widest).length);
  const start = lines.slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
  const which = countOccurrences(source.slice(0, start + sent.length), sent);
  return `${fence(sent)}${where(countOccurrences(source, sent), which)}`;
}

/**
 * The 1-based line of the occurrence of `quote` in `source` that starts closest to `line`, or
 * undefined when `quote` isn't there: where a selection's code went after Undo or Redo.
 */
export function quoteLineNear(source: string, quote: string, line: number): number | undefined {
  let best: number | undefined;
  for (let at = source.indexOf(quote); at !== -1; at = source.indexOf(quote, at + 1)) {
    const found = source.slice(0, at).split("\n").length;
    if (best === undefined || Math.abs(found - line) < Math.abs(best - line)) best = found;
  }
  return best;
}
