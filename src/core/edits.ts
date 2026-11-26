import type { Edit } from "./tools";

export type ApplyResult = { ok: true; source: string } | { ok: false; error: string };

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) count++;
  return count;
}

/** Applies find/replace edits in order. Each `find` must match the template (as edited so far) exactly once. */
export function applyEdits(source: string, edits: Edit[]): ApplyResult {
  if (edits.length === 0) return { ok: false, error: "no edits were given" };
  let current = source;
  for (const [i, { find, replace }] of edits.entries()) {
    const label = `edit ${i + 1}`;
    if (find === "") return { ok: false, error: `${label}: \`find\` is empty` };
    const matches = countOccurrences(current, find);
    if (matches === 0) {
      return {
        ok: false,
        error: `${label}: \`find\` text was not found in the template; copy it exactly from the current template`,
      };
    }
    if (matches > 1) {
      return { ok: false, error: `${label}: \`find\` text matches ${matches} places; make it longer so it is unique` };
    }
    const at = current.indexOf(find);
    current = current.slice(0, at) + replace + current.slice(at + find.length);
  }
  return { ok: true, source: current };
}
