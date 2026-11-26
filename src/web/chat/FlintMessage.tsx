import type { TurnResult } from "../../core";
import { flintText } from "../session/flint-text";
import { Chips } from "./Chips";

type Props = {
  result: TurnResult;
  /** Sends a chip as the seller's reply. Only the latest, unanswered question gets it. */
  onChoose?: (option: string) => void;
};

/**
 * Flint's bubble for one turn's outcome. Only the user-facing text is shown, never code or
 * Ember's side commentary. Per-kind extras (chips for `ask`, an Upload button for `asset`) go here.
 */
export function FlintMessage({ result, onChoose }: Props) {
  return (
    <div className={`message message-flint message-${result.type}`} data-author="flint" data-kind={result.type}>
      <p>{flintText(result)}</p>
      {result.type === "ask" && onChoose && <Chips options={result.options} onChoose={onChoose} />}
    </div>
  );
}
