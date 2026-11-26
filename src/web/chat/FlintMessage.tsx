import type { TurnResult } from "../../core";
import { flintText } from "../session/flint-text";
import { AssetUpload, type OnUpload } from "./AssetUpload";
import { Chips } from "./Chips";

type Props = {
  result: TurnResult;
  /** Sends a chip as the seller's reply. Only the latest, unanswered question gets it. */
  onChoose?: (option: string) => void;
  /** Stores an uploaded image for an `asset` request. */
  onUpload?: OnUpload;
};

/**
 * Flint's bubble for one turn's outcome. Only the user-facing text is shown, never code or
 * Ember's side commentary. Per-kind extras (chips for `ask`, an Upload button for `asset`) go here.
 */
export function FlintMessage({ result, onChoose, onUpload }: Props) {
  return (
    <div className={`message message-flint message-${result.type}`} data-author="flint" data-kind={result.type}>
      <p>{flintText(result)}</p>
      {result.type === "ask" && onChoose && <Chips options={result.options} onChoose={onChoose} />}
      {result.type === "asset" && onUpload && <AssetUpload onUpload={onUpload} />}
    </div>
  );
}
