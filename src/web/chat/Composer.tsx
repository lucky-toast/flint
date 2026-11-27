import { useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "../../core";
import { SelectionStrip } from "./SelectionChip";

type Props = {
  disabled: boolean;
  onSend: (message: string) => void;
  /** What's selected on the working slip: shown as a strip on top of the box. */
  selection?: { name: string; onClear: () => void };
};

/** The message box. Refuses more than MAX_MESSAGE_LENGTH characters, however they arrive. */
export function Composer({ disabled, onSend, selection }: Props) {
  const [draft, setDraft] = useState("");

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (disabled || !draft.trim()) return;
    onSend(draft);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter adds a line break.
    if (e.key === "Enter" && !e.shiftKey) submit(e);
  };

  return (
    <form className={selection ? "composer composer-selected" : "composer"} onSubmit={submit}>
      {selection && <SelectionStrip name={selection.name} onClear={selection.onClear} />}
      <textarea
        aria-label="Message Flint"
        placeholder={selection ? `Tell Flint what to change about ${selection.name}…` : "Tell Flint what to change…"}
        value={draft}
        maxLength={MAX_MESSAGE_LENGTH}
        rows={3}
        onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
        onKeyDown={onKeyDown}
      />
      <div className="composer-footer">
        {/* The count only shows once the limit is near; until then it's just noise. */}
        <span className="composer-count" aria-live="polite">
          {draft.length >= MAX_MESSAGE_LENGTH * 0.8 ? `${draft.length}/${MAX_MESSAGE_LENGTH}` : ""}
        </span>
        <button type="submit" disabled={disabled || !draft.trim()}>
          Send
        </button>
      </div>
    </form>
  );
}
