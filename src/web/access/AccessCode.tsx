import { useState, type FormEvent } from "react";
import type { AccessApi, NotLiveReason } from "./useAccess";

const NOT_LIVE_NOTE: Record<NotLiveReason, string> = {
  paused: "Live mode is paused",
  budget: "Live budget is used up",
};

/** The header's mode badge (Live or Replay) and the access-code entry. */
export function AccessCode({ mode, hasCode, notLive, submit, forget }: AccessApi) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  if (mode === "checking") return null;

  if (mode === "live") {
    return (
      <div className="access">
        <span className="mode-badge mode-live">Live</span>
        {hasCode && (
          <button type="button" className="access-link" onClick={forget}>
            Forget code
          </button>
        )}
      </div>
    );
  }

  const replayBadge = (
    <span className="mode-badge mode-replay" title="Playing recorded responses to the demo requests">
      Replay
    </span>
  );

  // A valid code, but live mode is unavailable: say why rather than offering the code entry again.
  if (hasCode && notLive) {
    return (
      <div className="access">
        {replayBadge}
        <span className="access-note">{NOT_LIVE_NOTE[notLive]}</span>
        <button type="button" className="access-link" onClick={forget}>
          Forget code
        </button>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    const ok = await submit(code);
    setBusy(false);
    setError(!ok);
    if (ok) {
      setOpen(false);
      setCode("");
    }
  };

  return (
    <div className="access">
      {replayBadge}
      {open ? (
        <form className="access-form" onSubmit={onSubmit} aria-label="Enter an access code">
          <input
            type="password"
            aria-label="Access code"
            placeholder="Access code"
            value={code}
            autoComplete="off"
            onChange={(e) => {
              setCode(e.target.value);
              setError(false);
            }}
          />
          <button type="submit" disabled={!code.trim() || busy}>
            Unlock
          </button>
          {error && (
            <span className="access-error" role="alert">
              That code didn't work
            </span>
          )}
        </form>
      ) : (
        <button type="button" className="access-link" onClick={() => setOpen(true)}>
          Have an access code?
        </button>
      )}
    </div>
  );
}
