import type { TurnResult } from "../../core";
import { flintText } from "../session/flint-text";

type Props = { result: TurnResult };

/**
 * Flint's bubble for one turn's outcome. Only the user-facing text is shown, never code or
 * Ember's side commentary. Per-kind extras (chips for `ask`, an Upload button for `asset`) go here.
 */
export function FlintMessage({ result }: Props) {
  return (
    <div className={`message message-flint message-${result.type}`} data-author="flint" data-kind={result.type}>
      <p>{flintText(result)}</p>
    </div>
  );
}
