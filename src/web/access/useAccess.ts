import { useCallback, useEffect, useState } from "react";
import { fetchStatus } from "../api";
import { loadAccessCode, saveAccessCode } from "./access-code";

/** "replay" unless the Worker confirms live mode for this browser's access code. */
export type AccessMode = "checking" | "live" | "replay";

export type AccessApi = {
  mode: AccessMode;
  /** Whether this browser holds a valid access code. */
  hasCode: boolean;
  /** Saves a code and checks it. Resolves false (and forgets it) when the Worker refuses it. */
  submit: (code: string) => Promise<boolean>;
  forget: () => void;
};

async function check(): Promise<{ mode: AccessMode; access: boolean }> {
  const status = await fetchStatus();
  const access = !!status?.access;
  // Live only with a valid code, live mode on and budget left; otherwise turns are replayed.
  const live = access && !!status?.live && (status?.budgetRemainingPct ?? 0) > 0;
  return { mode: live ? "live" : "replay", access };
}

/** Live or replay mode for this browser, from its stored access code and the Worker's status. */
export function useAccess(): AccessApi {
  const [mode, setMode] = useState<AccessMode>("checking");
  const [hasCode, setHasCode] = useState(() => !!loadAccessCode());

  useEffect(() => {
    let cancelled = false;
    void check().then((r) => {
      if (cancelled) return;
      setMode(r.mode);
      setHasCode(r.access);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = useCallback(async (code: string) => {
    saveAccessCode(code.trim());
    const r = await check();
    if (!r.access) saveAccessCode(undefined);
    setHasCode(r.access);
    setMode(r.mode);
    return r.access;
  }, []);

  const forget = useCallback(() => {
    saveAccessCode(undefined);
    setHasCode(false);
    setMode("replay");
  }, []);

  return { mode, hasCode, submit, forget };
}
