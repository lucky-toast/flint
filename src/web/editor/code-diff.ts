import { diffArrays } from "diff";

/** One row of a readable line diff: a changed or context line, or a fold of unchanged lines. */
export type DiffRow =
  | { kind: "added" | "removed" | "same"; text: string }
  | { kind: "skip"; lines: number };

function splitLines(source: string): string[] {
  const lines = source.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * The working template's changes against the original, line by line. Unchanged lines more than
 * `context` lines from a change fold into "skip" rows. No rows means nothing changed.
 */
export function codeDiff(original: string, working: string, context = 3): DiffRow[] {
  const rows: (DiffRow & { kind: "added" | "removed" | "same" })[] = [];
  for (const part of diffArrays(splitLines(original), splitLines(working))) {
    const kind = part.added ? "added" : part.removed ? "removed" : "same";
    for (const text of part.value) rows.push({ kind, text });
  }
  if (!rows.some((r) => r.kind !== "same")) return [];

  // Keep each unchanged line within `context` rows of a change; fold the rest.
  const keep = rows.map(() => false);
  rows.forEach((r, i) => {
    if (r.kind === "same") return;
    for (let j = Math.max(0, i - context); j <= Math.min(rows.length - 1, i + context); j++) keep[j] = true;
  });
  const out: DiffRow[] = [];
  rows.forEach((r, i) => {
    if (keep[i]) return void out.push(r);
    const last = out[out.length - 1];
    if (last?.kind === "skip") last.lines++;
    else out.push({ kind: "skip", lines: 1 });
  });
  return out;
}
