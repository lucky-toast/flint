import { useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "../../core";

type Props = { disabled: boolean; onSend: (message: string) => void };

/** The message box. Refuses more than MAX_MESSAGE_LENGTH characters, however they arrive. */
export function Composer({ disabled, onSend }: Props) {
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
    <form className="composer" onSubmit={submit}>
      <textarea
        aria-label="Message Flint"
        placeholder="Tell Flint what to change…"
        value={draft}
        maxLength={MAX_MESSAGE_LENGTH}
        rows={3}
        onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
        onKeyDown={onKeyDown}
      />
      <div className="composer-footer">
        <span className="composer-count" aria-live="polite">
          {draft.length}/{MAX_MESSAGE_LENGTH}
        </span>
        <button type="submit" disabled={disabled || !draft.trim()}>
          Send
        </button>
      </div>
    </form>
  );
}
