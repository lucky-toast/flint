#!/usr/bin/env node
// Runs `wrangler dev` with turn logging on (LOG_EMBER=on) and saves the log lines the Worker prints
// to logs/<timestamp>/, in the limit test's layout:
//   calls.jsonl  one line per Ember call: exact request body, raw response or error, HTTP status, latency
//   runs.jsonl   one line per turn: request, attempts (tool calls, usage), outcome, template before/after
// Build review.html from them with `npm run review`. Extra arguments go to wrangler dev.

import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const LOG_PREFIX = "[flint-log] "; // keep in step with src/worker/ember-log.ts

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = join(root, "logs", new Date().toISOString().replace(/[:.]/g, "-"));
let callSeq = 0;
let runSeq = 0;

const wrangler = spawn(
  process.execPath,
  [`${root}node_modules/wrangler/bin/wrangler.js`, "dev", "--var", "LOG_EMBER:on", ...process.argv.slice(2)],
  { cwd: root, stdio: ["inherit", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" } },
);

function save(line) {
  const { file, record } = JSON.parse(line.slice(line.indexOf(LOG_PREFIX) + LOG_PREFIX.length));
  if (!callSeq && !runSeq) {
    mkdirSync(dir, { recursive: true });
    console.log(`Logging turns to ${dir}`);
  }
  if (file === "calls.jsonl") {
    record.seq = ++callSeq;
    const tokens = record.response?.usage;
    console.log(
      `  ember call ${record.seq} · turn ${record.turn} · attempt ${record.attempt} · HTTP ${record.httpStatus ?? "–"} · ${record.latencyMs} ms` +
        (tokens ? ` · ${tokens.input_tokens} in / ${tokens.output_tokens} out` : "") +
        (record.error ? ` · ${record.error}` : ""),
    );
  } else {
    record.seq = ++runSeq;
    console.log(`  turn ${record.turn} · ${record.mode} · ${record.outcome} · "${record.request}"`);
  }
  appendFileSync(join(dir, file), JSON.stringify(record) + "\n");
}

function pipe(stream, out) {
  createInterface({ input: stream }).on("line", (line) => {
    if (line.includes(LOG_PREFIX)) {
      try {
        save(line);
        return;
      } catch (err) {
        console.error(`Couldn't save a log line: ${err.message}`);
      }
    }
    out.write(line + "\n");
  });
}

pipe(wrangler.stdout, process.stdout);
pipe(wrangler.stderr, process.stderr);
wrangler.on("exit", (code) => {
  if (callSeq || runSeq) console.log(`Saved ${runSeq} turns and ${callSeq} Ember calls in ${dir}. Run \`npm run review\` to see them.`);
  process.exit(code ?? 0);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => wrangler.kill(signal));
