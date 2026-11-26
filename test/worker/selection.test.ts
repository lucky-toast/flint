import { describe, expect, it } from "vitest";
import { LINE_ATTRIBUTE, MAX_SELECTION_LENGTH, instrumentSource, quoteLineNear, selectionNote } from "../../src/core";

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

  it("counts the occurrences of the quote it sends when the line is too long to quote whole", () => {
    const prefix = '<p class="note">';
    const lookAlike = prefix + "x".repeat(MAX_SELECTION_LENGTH + 500) + "y";
    const line = prefix + "x".repeat(MAX_SELECTION_LENGTH + 1000);
    const long = [lookAlike, line, line].join("\n");

    const note = selectionNote({ source: long, line: 2, name: "Note" });

    const quote = quoteOf(note)!;
    expect(note.length).toBeLessThanOrEqual(MAX_SELECTION_LENGTH);
    expect(line.startsWith(quote) && lookAlike.startsWith(quote)).toBe(true);
    expect(note).toContain("occurs 3 times in the template; the seller means occurrence 2");
  });
});

describe("instrumentSource", () => {
  it("marks each opening tag with its line but leaves Liquid markup alone", () => {
    const liquid = ['<div class="slip">', '  {% if a<b %}<b>yes</b>{% endif %}', '  <p>{{ "<b>hi</b>" }}</p>'].join("\n");

    expect(instrumentSource(liquid)).toBe(
      [
        `<div ${LINE_ATTRIBUTE}="1" class="slip">`,
        `  {% if a<b %}<b ${LINE_ATTRIBUTE}="2">yes</b>{% endif %}`,
        `  <p ${LINE_ATTRIBUTE}="3">{{ "<b>hi</b>" }}</p>`,
      ].join("\n"),
    );
  });
});

describe("quoteLineNear", () => {
  const twice = ["<div>", '  <p class="a">', "</div>", "<div>", '  <p class="a">', "</div>"].join("\n");

  it("finds the occurrence of the quote closest to the line it was on", () => {
    expect(quoteLineNear(twice, '  <p class="a">', 2)).toBe(2);
    expect(quoteLineNear(twice, '  <p class="a">', 4)).toBe(5);
  });

  it("is undefined when the quote is gone", () => {
    expect(quoteLineNear(twice, '<p class="b">', 2)).toBeUndefined();
  });
});
