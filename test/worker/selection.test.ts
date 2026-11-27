import { describe, expect, it } from "vitest";
import { LINE_ATTRIBUTE, MAX_SELECTION_LENGTH, POSITION_ATTRIBUTE, instrumentSource, selectionNote } from "../../src/core";

// What Flint is told about a selection: the part's name and its opening tag from the template,
// with which occurrence of that tag it is when the tag isn't unique.

const source = [
  '<div class="slip">',
  '  <section class="addresses">',
  '    <div class="ship-to">',
  "      <h2>Ship to</h2>",
  "    </div>",
  "  </section>",
  '  <section class="addresses">',
  '    <div class="ship-to">',
  "      <h2>Return to</h2>",
  "    </div>",
  "  </section>",
  '  <table><tr><td class="{{ col }}">a</td><td class="{{ col }}">b</td></tr></table>',
  "</div>",
].join("\n");

describe("selectionNote", () => {
  it("names the part and quotes its opening tag, with no occurrence when the tag is unique", () => {
    expect(selectionNote({ source, line: 1, position: 0, name: "Slip" })).toBe(
      'The seller selected the "Slip" part. In the template it\'s the opening tag `<div class="slip">`.',
    );
  });

  it("says which occurrence of a repeated tag it is, counting from the top", () => {
    expect(selectionNote({ source, line: 3, position: 0, name: "Ship to" })).toBe(
      'The seller selected the "Ship to" part. In the template it\'s the opening tag `<div class="ship-to">`, occurrence 1 of 2 counting from the top.',
    );
    expect(selectionNote({ source, line: 8, position: 0, name: "Ship to" })).toContain(
      '`<div class="ship-to">`, occurrence 2 of 2 counting from the top.',
    );
  });

  it("picks the clicked tag by its position on the line and keeps its Liquid", () => {
    expect(selectionNote({ source, line: 12, position: 3, name: "Col column" })).toContain(
      '`<td class="{{ col }}">`, occurrence 2 of 2 counting from the top.',
    );
  });

  it("copies a tag that spans lines, past a > inside Liquid or quotes", () => {
    const multi = ['<p class="note"', '   title="a > b" data-x="{{ x > 1 }}">', "</p>"].join("\n");

    expect(selectionNote({ source: multi, line: 1, position: 0, name: "Note" })).toContain(
      '`<p class="note"\n   title="a > b" data-x="{{ x > 1 }}">`.',
    );
  });

  it(`fits in ${MAX_SELECTION_LENGTH} characters, counting the occurrence on the trimmed tag`, () => {
    const prefix = '<p class="note" title="';
    const lookAlike = `${prefix}${"x".repeat(300)}y">`;
    const line = `${prefix}${"x".repeat(400)}">`;
    const long = [lookAlike, line, line].join("\n");

    const note = selectionNote({ source: long, line: 2, position: 0, name: "Note" });

    expect(note.length).toBeLessThanOrEqual(MAX_SELECTION_LENGTH);
    const quote = /the opening tag that starts `([^`]*)`/.exec(note)![1]!;
    expect(line.startsWith(quote) && lookAlike.startsWith(quote)).toBe(true);
    expect(note).toContain("occurrence 2 of 3 counting from the top.");
  });
});

describe("instrumentSource", () => {
  it("marks each opening tag with its line and position on the line, but leaves Liquid markup alone", () => {
    const liquid = ['<div class="slip">', '  {% if a<b %}<b>yes</b><i>!</i>{% endif %}', '  <p>{{ "<b>hi</b>" }}</p>'].join("\n");
    const at = (line: number, position: number) => `${LINE_ATTRIBUTE}="${line}" ${POSITION_ATTRIBUTE}="${position}"`;

    expect(instrumentSource(liquid)).toBe(
      [
        `<div ${at(1, 0)} class="slip">`,
        `  {% if a<b %}<b ${at(2, 0)}>yes</b><i ${at(2, 1)}>!</i>{% endif %}`,
        `  <p ${at(3, 0)}>{{ "<b>hi</b>" }}</p>`,
      ].join("\n"),
    );
  });
});
