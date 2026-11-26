// Pointing at the working slip: the preview-only instrumented template, and what Flint is told
// about a selection. Flint sees only the template (never the example orders or line numbers) and
// edits by exact find/replace, so a selection is described by the part's name and its template
// code, quoted verbatim and made unique the way an edit's `find` must be.

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
    .map((line, i) => line.replace(/<([a-zA-Z][a-zA-Z0-9]*)(?=[\s>/])/g, `<$1 ${LINE_ATTRIBUTE}="${i + 1}"`))
    .join("\n");
}

/** How many times `needle` occurs in `haystack`, overlapping ones included (as a find would see them). */
function occurrences(haystack: string, needle: string): number {
  let count = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) count++;
  return count;
}

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
    if (source.indexOf(quote) === source.lastIndexOf(quote)) return quote;
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
  const text = lines[line - 1] ?? "";
  const before = lines.slice(0, line - 1).join("\n");
  const which = occurrences(before ? `${before}\n${text}` : text, text);
  const where = `\nThat code occurs ${occurrences(source, text)} times in the template; the seller means occurrence ${which}, counting from the top.`;
  return `${fence(text.slice(0, budget - where.length))}${where}`;
}
