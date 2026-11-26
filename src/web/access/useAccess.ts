import { useCallback, useEffect, useState } from "react";
import { fetchStatus } from "../api";
import { loadAccessCode, saveAccessCode } from "./access-code";

/** "replay" unless the Worker confirms live mode for this browser's access code. */
export type AccessMode = "checking" | "live" | "replay";

/** Why a browser holding a valid code still gets replay: the kill switch or key, or the budget. */
export type NotLiveReason = "paused" | "budget";

export type AccessApi = {
  mode: AccessMode;
  /** Whether this browser holds a valid access code. */
  hasCode: boolean;
  /** Set in replay mode when this browser holds a valid code, saying why live mode is unavailable. */
  notLive?: NotLiveReason;
  /** Saves a code and checks it. Resolves false (and forgets it) when the Worker refuses it. */
  submit: (code: string) => Promise<boolean>;
  forget: () => void;
};

type Check = { mode: AccessMode; access: boolean; notLive?: NotLiveReason };

async function check(): Promise<Check> {
  const status = await fetchStatus();
  const access = !!status?.access;
  if (!access) return { mode: "replay", access };
  // Live only with a valid code, live mode on and budget left; otherwise turns are replayed.
  if (!status?.live) return { mode: "replay", access, notLive: "paused" };
  if ((status.budgetRemainingPct ?? 0) <= 0) return { mode: "replay", access, notLive: "budget" };
  return { mode: "live", access };
}

/** Live or replay mode for this browser, from its stored access code and the Worker's status. */
export function useAccess(): AccessApi {
  const [mode, setMode] = useState<AccessMode>("checking");
  const [hasCode, setHasCode] = useState(() => !!loadAccessCode());
  const [notLive, setNotLive] = useState<NotLiveReason>();

  const apply = useCallback((r: Check) => {
    setHasCode(r.access);
    setNotLive(r.notLive);
    setMode(r.mode);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void check().then((r) => {
      if (!cancelled) apply(r);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const submit = useCallback(
    async (code: string) => {
      saveAccessCode(code.trim());
      const r = await check();
      if (!r.access) saveAccessCode(undefined);
      apply(r);
      return r.access;
    },
    [apply],
  );

  const forget = useCallback(() => {
    saveAccessCode(undefined);
    apply({ mode: "replay", access: false });
  }, [apply]);

  return { mode, hasCode, notLive, submit, forget };
}
