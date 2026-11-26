import { describe, expect, it } from "vitest";
import { codeDiff } from "../../src/web/editor/code-diff";

const lines = (...xs: string[]) => xs.join("\n") + "\n";

describe("codeDiff", () => {
  it("has no rows when nothing changed", () => {
    expect(codeDiff(lines("a", "b"), lines("a", "b"))).toEqual([]);
  });

  it("shows a changed line as removed then added, with a little context, and folds the rest", () => {
    const original = lines("1", "2", "3", "4", "5", "old", "7", "8", "9", "10", "11");
    const working = lines("1", "2", "3", "4", "5", "new", "7", "8", "9", "10", "11");
    expect(codeDiff(original, working, 2)).toEqual([
      { kind: "skip", lines: 3 },
      { kind: "same", text: "4" },
      { kind: "same", text: "5" },
      { kind: "removed", text: "old" },
      { kind: "added", text: "new" },
      { kind: "same", text: "7" },
      { kind: "same", text: "8" },
      { kind: "skip", lines: 3 },
    ]);
  });

  it("keeps nearby changes in one stretch and copes with a missing final newline", () => {
    expect(codeDiff("a\nb\nc", "A\nb\nC", 2)).toEqual([
      { kind: "removed", text: "a" },
      { kind: "added", text: "A" },
      { kind: "same", text: "b" },
      { kind: "removed", text: "c" },
      { kind: "added", text: "C" },
    ]);
  });
});
