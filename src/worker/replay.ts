import { runTurn, type EmberClient, type Shop, type TurnInput, type TurnResult } from "../core";
import { findReplay, REPLAY_SHOP_ID, type ReplayCall } from "../data";

// Replay mode: recorded responses (src/data/replay.ts) run through the same turn loop as live
// turns, so edits are applied and validated against every order and the answer has the same shape.
// No Ember call is made, so replay spends no budget.

export const ACCESS_CODE_NOTE = "Live mode needs an access code; try one of these 👇";

export const REPLAY_DOESNT_FIT =
  "That replay step doesn't fit the slip as it is now 🤔 Replay follows the demo on the Classic slip, so try Undo or the chips in order.";

export const REPLAY_OTHER_SHOP =
  "Replay mode plays the demo on Kiln & Co.'s Classic slip. Switch to Kiln & Co. to try the chips, or enter an access code for live mode.";

/** A stand-in for Ember that answers each attempt with the next recorded call. */
function replayEmber(calls: ReplayCall[]): EmberClient {
  let attempt = 0;
  return {
    async respond() {
      const call = calls[attempt++];
      return {
        status: "completed",
        output: call
          ? [{ type: "function_call", call_id: `replay_${attempt}`, name: call.name, arguments: JSON.stringify(call.arguments) }]
          : [],
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      };
    },
  };
}

/** Answers a turn from replay, or returns undefined when replay has nothing for this message. */
export async function replayTurn(shop: Shop, input: TurnInput): Promise<TurnResult | undefined> {
  const calls = findReplay(input.message);
  if (!calls) return undefined;
  if (shop.id !== REPLAY_SHOP_ID) return { type: "reply", message: REPLAY_OTHER_SHOP };
  const result = await runTurn({ ember: replayEmber(calls), shop, input });
  // A recorded edit that no longer applies (e.g. the slip was changed some other way).
  if (result.type === "error") return { type: "reply", message: REPLAY_DOESNT_FIT };
  return result;
}
