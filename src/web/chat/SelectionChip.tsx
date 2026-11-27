type Props = {
  /** The selected part's name, or undefined when nothing is selected. */
  name?: string;
  onClear: () => void;
};

/** Above the message box: what the next message is about (its name and an ×), or a tip that the slip can be pointed at. */
export function SelectionChip({ name, onClear }: Props) {
  if (!name) return <p className="selection-tip">Tip: click part of the working slip to point at it.</p>;
  return (
    <div className="selection-chip" role="status" aria-label="Selection">
      <span>
        📍 <strong>{name}</strong>
      </span>
      <button type="button" className="selection-clear" aria-label="Clear selection" onClick={onClear}>
        ×
      </button>
    </div>
  );
}
