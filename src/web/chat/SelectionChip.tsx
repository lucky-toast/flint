type Props = {
  /** The selected part's name, or undefined when nothing is selected. */
  name?: string;
  onClear: () => void;
};

/** The tip above the message box while nothing is selected. */
export function SelectionTip() {
  return <p className="selection-tip">Tip: click part of the working slip to point at it.</p>;
}

/**
 * What the next message is about: a tinted strip joined to the top of the message box, naming the
 * selected part, with an × to clear it.
 */
export function SelectionStrip({ name, onClear }: Required<Props>) {
  return (
    <div className="selection-strip" role="status" aria-label="Selection">
      <span>
        Selected: <strong>{name}</strong>
      </span>
      <button type="button" className="selection-clear" aria-label="Clear selection" onClick={onClear}>
        ×
      </button>
    </div>
  );
}
