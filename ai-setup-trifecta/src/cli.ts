/**
 * ai-setup-trifecta CLI. Reads one local JSON file, writes to stdout/stderr only, no network.
 *   check <setups.json>
 * Exit: 0 no setup BLOCKED, 1 at least one setup BLOCKED, 2 invalid input or usage.
 * Idea credit: Simon Willison, https://simonwillison.net/2025/jun/16/the-lethal-trifecta/
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, stderr, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { checkDocument, formatLine } from "./trifecta.ts";

const USAGE = `usage: check <setups.json>
exit codes: 0 none BLOCKED, 1 at least one BLOCKED, 2 invalid input`;

export interface CliResult {
  code: number;
  out: string;
  err: string;
}

export function runCli(args: string[], read: (path: string) => string = (p) => readFileSync(p, "utf8")): CliResult {
  const [command, file, ...rest] = args;
  if (command !== "check" || !file || rest.length > 0) {
    return { code: 2, out: "", err: `${USAGE}\n` };
  }
  let text: string;
  try {
    text = read(file);
  } catch {
    return { code: 2, out: "", err: `cannot read ${file}\n` };
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (e) {
    return { code: 2, out: "", err: `${file} is not valid JSON: ${(e as Error).message}\n` };
  }
  const checked = checkDocument(input);
  if (!checked.ok) {
    return { code: 2, out: "", err: `invalid setups file ${file}:\n${checked.errors.map((e) => `  - ${e}`).join("\n")}\n` };
  }
  const out = checked.results.map(formatLine).join("\n") + "\n";
  const blocked = checked.results.some((r) => r.verdict === "BLOCKED");
  return { code: blocked ? 1 : 0, out, err: "" };
}

if (argv[1] && resolve(argv[1]) === fileURLToPath(import.meta.url)) {
  const res = runCli(argv.slice(2));
  if (res.out) stdout.write(res.out);
  if (res.err) stderr.write(res.err);
  process.exitCode = res.code;
}
