// The judge's access code, kept in this browser and sent with every API call. Without a valid one,
// the Worker answers turns from replay.

/** Must match ACCESS_CODE_HEADER in src/worker/access.ts. */
export const ACCESS_CODE_HEADER = "x-flint-access-code";

const STORAGE_KEY = "flint-access-code";

export function loadAccessCode(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

/** Saves the code, or forgets it when undefined. Storage failures just mean it isn't remembered. */
export function saveAccessCode(code: string | undefined): void {
  try {
    if (code) localStorage.setItem(STORAGE_KEY, code);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not remembered; requests then carry no code.
  }
}

/** The header carrying the stored code, if there is one. */
export function accessHeaders(): Record<string, string> {
  const code = loadAccessCode();
  return code ? { [ACCESS_CODE_HEADER]: code } : {};
}
