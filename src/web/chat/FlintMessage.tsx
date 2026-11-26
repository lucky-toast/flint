import type { TurnResult } from "../../core";
import { flintText } from "../session/flint-text";
import { AssetUpload, type OnUpload } from "./AssetUpload";

type Props = { result: TurnResult; onUpload?: OnUpload };

/**
 * Flint's bubble for one turn's outcome. Only the user-facing text is shown, never code or
 * Ember's side commentary. Per-kind extras (chips for `ask`, an Upload button for `asset`) go here.
 */
export function FlintMessage({ result, onUpload }: Props) {
  return (
    <div className={`message message-flint message-${result.type}`} data-author="flint" data-kind={result.type}>
      <p>{flintText(result)}</p>
      {result.type === "asset" && onUpload && <AssetUpload onUpload={onUpload} />}
    </div>
  );
}
