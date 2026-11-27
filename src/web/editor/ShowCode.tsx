import { useId, useMemo } from "react";
import { codeDiff } from "./code-diff";

/**
 * The "Show code" toggle for curious sellers, in the editor toolbar. The code itself (CodeView)
 * shows under the working slip. The chat never shows code.
 */
export function ShowCodeToggle({ shown, onChange }: { shown: boolean; onChange: (shown: boolean) => void }) {
  const id = useId();
  return (
    <label className="show-code-toggle" htmlFor={id}>
      <input id={id} type="checkbox" checked={shown} onChange={(e) => onChange(e.target.checked)} />
      Show code
    </label>
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
