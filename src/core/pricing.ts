import { MAX_OUTPUT_TOKENS, type Usage } from "./ember";

// muse-ember-1.0 pricing, in nano-dollars (1e-9 USD) per token so budget arithmetic stays in
// integers: $0.10 per 1M input, $0.004 per 1M cached input, $0.50 per 1M output.
export const NANO_USD_PER_INPUT_TOKEN = 100;
export const NANO_USD_PER_CACHED_INPUT_TOKEN = 4;
export const NANO_USD_PER_OUTPUT_TOKEN = 500;

export const NANO_USD_PER_USD = 1_000_000_000;

/** What one Ember call actually cost. Cached tokens are part of `inputTokens`. */
export function costNanoUsd({ inputTokens, cachedInputTokens, outputTokens }: Usage): number {
  const cached = Math.min(cachedInputTokens, inputTokens);
  return (
    (inputTokens - cached) * NANO_USD_PER_INPUT_TOKEN +
    cached * NANO_USD_PER_CACHED_INPUT_TOKEN +
    outputTokens * NANO_USD_PER_OUTPUT_TOKEN
  );
}

/**
 * The most one Ember call can cost, given its serialized request body. A token is at least one
 * UTF-8 byte, so the body's byte length bounds the input tokens; all of them are priced as
 * uncached, and output is capped at MAX_OUTPUT_TOKENS (reasoning included). `storedBytes` is the
 * earlier conversation a chained request stands for, counted as input too in case it's billed.
 */
export function worstCaseNanoUsd(requestBody: string, storedBytes = 0): number {
  const inputTokens = new TextEncoder().encode(requestBody).byteLength + storedBytes;
  return costNanoUsd({ inputTokens, cachedInputTokens: 0, outputTokens: MAX_OUTPUT_TOKENS });
}
