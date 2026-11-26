type Props = { options: string[]; onChoose: (option: string) => void };

/** Quick-reply chips under a clarifying question. Tapping one sends it as the seller's reply. */
export function Chips({ options, onChoose }: Props) {
  if (options.length === 0) return null;
  return (
    <div className="chips" role="group" aria-label="Quick replies">
      {options.map((option) => (
        <button key={option} type="button" className="chip" onClick={() => onChoose(option)}>
          {option}
        </button>
      ))}
    </div>
  );
}
