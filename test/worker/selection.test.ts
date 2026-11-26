import { describe, expect, it } from "vitest";
import { MAX_SELECTION_LENGTH, selectionNote } from "../../src/core";

// What Flint is told about a selection: the part's name and its template code, made unique.

const source = [
  "<div class=\"slip\">",
  "  <section class=\"addresses\">",
  "    <div class=\"ship-to\">",
  "      <h2>Ship to</h2>",
  "    </div>",
  "  </section>",
  "  <section class=\"addresses\">",
  "    <div class=\"ship-to\">",
  "      <h2>Return to</h2>",
  "    </div>",
  "  </section>",
  "</div>",
].join("\n");

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/** The code block in a note. */
const quoteOf = (note: string) => /```liquid\n([\s\S]*?)\n```/.exec(note)?.[1];

describe("selectionNote", () => {
  it("quotes a unique line as it is, with the part's name", () => {
    const note = selectionNote({ source, line: 1, name: "Slip" });

    expect(note).toBe('The seller selected the "Slip" part of the slip. In the template it is:\n```liquid\n<div class="slip">\n```');
  });

  it("extends a look-alike line until the quote occurs once", () => {
    const first = quoteOf(selectionNote({ source, line: 3, name: "Ship to" }))!;
    const second = quoteOf(selectionNote({ source, line: 8, name: "Ship to" }))!;

    expect(first).toBe('    <div class="ship-to">\n      <h2>Ship to</h2>');
    expect(second).toBe('    <div class="ship-to">\n      <h2>Return to</h2>');
    expect(occurrences(source, first)).toBe(1);
    expect(occurrences(source, second)).toBe(1);
  });

  it("says when the template repeats the part on the slip", () => {
    expect(selectionNote({ source, line: 1, name: "Slip", repeats: true })).toContain("appears more than once on the slip");
  });

  it("falls back to the line and which occurrence it is when no unique quote fits", () => {
    const same = Array.from({ length: 3 }, () => ['<p class="note">', "x".repeat(MAX_SELECTION_LENGTH), "</p>"].join("\n"));
    const repeated = same.join("\n");

    const note = selectionNote({ source: repeated, line: 4, name: "Note" });

    expect(note.length).toBeLessThanOrEqual(MAX_SELECTION_LENGTH);
    expect(quoteOf(note)).toBe('<p class="note">');
    expect(note).toContain("occurs 3 times in the template; the seller means occurrence 2");
  });
});
