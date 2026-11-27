type Props = {
  /** The selected part's name, or undefined when nothing is selected. */
  name?: string;
  /** How many times the part shows on the slip; above 1, the chip says the edit reaches them all. */
  copies?: number;
  canSelectBigger: boolean;
  onSelectBigger: () => void;
  onClear: () => void;
};

/** Above the message box: what the next message is about, or a tip that the slip can be pointed at. */
export function SelectionChip({ name, copies = 1, canSelectBigger, onSelectBigger, onClear }: Props) {
  if (!name) return <p className="selection-tip">Tip: click part of the working slip to point at it.</p>;
  return (
    <div className="selection-chip" role="status" aria-label="Selection">
      <span>
        📍 About: <strong>{name}</strong>
        {copies > 1 && <span className="selection-copies"> · all {copies}</span>}
      </span>
      {canSelectBigger && (
        <button type="button" className="selection-bigger" onClick={onSelectBigger}>
          Select bigger
        </button>
      )}
      <button type="button" className="selection-clear" aria-label="Clear selection" onClick={onClear}>
        ×
      </button>
    </div>
  );
}
