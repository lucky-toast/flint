import { useEffect, useRef } from "react";
import type { Turn } from "../session/session";
import type { OnUpload } from "./AssetUpload";
import { Composer } from "./Composer";
import { FlintMessage } from "./FlintMessage";

type Props = {
  turns: Turn[];
  thinking: boolean;
  onSend: (message: string) => void;
  /** The turn that offers Try again, if any. */
  retryTurnId?: number;
  onTryAgain?: () => void;
  onUpload?: OnUpload;
};

/** The chat with Flint: the conversation so far, a thinking indicator, and the message box. */
export function Chat({ turns, thinking, onSend, retryTurnId, onTryAgain, onUpload }: Props) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns.length, thinking]);

  return (
    <aside className="chat">
      <h2>Flint</h2>
      <div className="chat-log" role="log" aria-label="Chat with Flint">
        {turns.length === 0 && (
          <div className="message message-flint" data-author="flint">
            <p>Hi! I'm Flint 👋 Tell me what you'd like to change on this slip.</p>
          </div>
        )}
        {turns.map((turn, i) => (
          <div
            key={turn.id}
            className={turn.undone ? "turn turn-undone" : "turn"}
            data-turn-id={turn.id}
            data-undone={turn.undone ? "true" : undefined}
          >
            <div className="message message-seller" data-author="seller">
              <p>{turn.message}</p>
            </div>
            {turn.result && (
              // Chips stay live only on the latest turn: once the seller answers, they're spent.
              <FlintMessage result={turn.result} onChoose={i === turns.length - 1 && !thinking ? onSend : undefined}
                onUpload={onUpload}
              />
            )}
            {turn.undone && <span className="turn-mark">Undone</span>}
            {turn.id === retryTurnId && onTryAgain && !thinking && (
              <button type="button" className="try-again" onClick={onTryAgain}>
                Try again
              </button>
            )}
          </div>
        ))}
        {thinking && (
          <p className="thinking" role="status">
            Flint is thinking…
          </p>
        )}
        <div ref={end} />
      </div>
      <Composer disabled={thinking} onSend={onSend} />
    </aside>
  );
}
