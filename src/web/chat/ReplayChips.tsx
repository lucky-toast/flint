type Props = {
  requests: string[];
  disabled: boolean;
  onChoose: (request: string) => void;
  /** Requests already sent in this chat: their chips stay, marked as tried. */
  used?: ReadonlySet<string>;
};

/**
 * Replay mode's suggestion chips: the scripted demo requests, in demo order. Tapping one sends it.
 * They fold away under their heading so a long chat keeps its room.
 */
export function ReplayChips({ requests, disabled, onChoose, used }: Props) {
  const tried = requests.filter((r) => used?.has(r)).length;
  return (
    <details className="replay-chips" open>
      <summary>
        Demo requests
        <span className="replay-chips-count">
          {tried > 0 ? `${tried} of ${requests.length} tried` : `${requests.length} recorded`}
        </span>
      </summary>
      <div className="replay-chips-list" role="group" aria-label="Try one of these">
        {requests.map((request) => {
          const isUsed = used?.has(request);
          return (
            <button
              key={request}
              type="button"
              className={isUsed ? "chip chip-used" : "chip"}
              disabled={disabled}
              onClick={() => onChoose(request)}
            >
              {isUsed && <span aria-hidden="true">✓ </span>}
              {request}
            </button>
          );
        })}
      </div>
    </details>
  );
}
