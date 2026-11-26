type Props = { requests: string[]; disabled: boolean; onChoose: (request: string) => void };

/** Replay mode's suggestion chips: the scripted demo requests, in demo order. Tapping one sends it. */
export function ReplayChips({ requests, disabled, onChoose }: Props) {
  return (
    <div className="replay-chips" role="group" aria-label="Try one of these">
      {requests.map((request) => (
        <button key={request} type="button" className="chip" disabled={disabled} onClick={() => onChoose(request)}>
          {request}
        </button>
      ))}
    </div>
  );
}
