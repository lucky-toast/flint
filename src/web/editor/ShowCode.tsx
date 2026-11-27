import { useMemo } from "react";
import { codeDiff } from "./code-diff";

/**
 * Slip / Code, on the Working pane's heading: Code shows the working template in place of the slip,
 * for curious sellers. The chat itself never shows code.
 */
export function SlipCodeSwitch({ shown, onChange }: { shown: boolean; onChange: (shown: boolean) => void }) {
  return (
    <div className="slip-code-switch" role="group" aria-label="Show the working slip or its code">
      <button type="button" aria-pressed={!shown} onClick={() => onChange(false)}>
        Slip
      </button>
      <button type="button" aria-pressed={shown} onClick={() => onChange(true)}>
        Code
      </button>
    </div>
  );
}

type Props = { original: string; working: string };

/** The working template's Liquid and a line diff against the original. */
export function CodeView({ original, working }: Props) {
  const rows = useMemo(() => codeDiff(original, working), [original, working]);
  return (
    <section className="code-view" aria-label="Template code">
      <section aria-label="Changes from the original">
        <h3>Changes from the original</h3>
        {rows.length === 0 ? (
          <p className="code-empty">No changes yet.</p>
        ) : (
          <pre className="code-diff">
            {rows.map((row, i) =>
              row.kind === "skip" ? (
                <div key={i} className="diff-skip">
                  ⋯ {row.lines} unchanged line{row.lines === 1 ? "" : "s"}
                </div>
              ) : (
                <div key={i} className={`diff-${row.kind}`} data-change={row.kind === "same" ? undefined : row.kind}>
                  <span className="diff-sign" aria-hidden="true">
                    {row.kind === "added" ? "+" : row.kind === "removed" ? "-" : " "}
                  </span>
                  {row.text}
                </div>
              ),
            )}
          </pre>
        )}
      </section>
      <section aria-label="Working template">
        <h3>Working template</h3>
        <pre className="code-source">{working}</pre>
      </section>
    </section>
  );
}
