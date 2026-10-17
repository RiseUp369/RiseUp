/**
 * probe3-readiness CLI. Reads local files, writes to stdout only, no network.
 *   check <plan.json> [--json] [--max-per-holder N] [--today YYYY-MM-DD]
 *   drill <plan.json> [--date YYYY-MM-DD]
 *   handoff <plan.json> [--format md|html] [--today YYYY-MM-DD]
 *   import-stewards <plan.json> <sheet.csv|sheet.md>
 * Exit: 0 READY / success, 1 NOT_READY, 2 SHRINK_TO_COAST, 3 bad input.
 */
import { readFileSync } from "node:fs";
import { argv, exit, stderr, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import type { AbsencePlan } from "./plan.ts";
import { readJson } from "./plan.ts";
import { validatePlan } from "./schema.ts";
import { checkPlan, formatCheck } from "./check.ts";
import { buildDrill } from "./drill.ts";
import { renderHandoff } from "./handoff.ts";
import { importStewards, parseStewardTable } from "./stewards.ts";

const USAGE = `usage:
  check <plan.json> [--json] [--max-per-holder N] [--today YYYY-MM-DD]
  drill <plan.json> [--date YYYY-MM-DD]
  handoff <plan.json> [--format md|html] [--today YYYY-MM-DD]
  import-stewards <plan.json> <sheet.csv|sheet.md>
exit codes: 0 READY, 1 NOT_READY, 2 SHRINK_TO_COAST, 3 invalid input`;

export interface CliResult { code: number; out: string; err: string }

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function loadPlan(path: string | undefined): AbsencePlan {
  if (!path) throw new Error("missing plan path");
  const plan = readJson(path);
  const v = validatePlan(plan);
  if (!v.ok) throw new Error(`invalid plan ${path}:\n  ${v.errors.join("\n  ")}`);
  return plan as AbsencePlan;
}

export function run(args: string[]): CliResult {
  const [cmd, ...rest] = args;
  try {
    switch (cmd) {
      case "check": {
        const max = flag(rest, "--max-per-holder");
        if (max !== undefined && !/^[1-9]\d*$/.test(max)) throw new Error("--max-per-holder must be a positive integer");
        const r = checkPlan(loadPlan(rest[0]), { maxScopePerHolder: max ? Number(max) : undefined, today: flag(rest, "--today") });
        const out = rest.includes("--json") ? JSON.stringify(r, null, 2) + "\n" : formatCheck(r);
        return { code: r.verdict === "READY" ? 0 : r.verdict === "NOT_READY" ? 1 : 2, out, err: "" };
      }
      case "drill":
        return { code: 0, out: buildDrill(loadPlan(rest[0]), { date: flag(rest, "--date") }).markdown, err: "" };
      case "handoff": {
        const fmt = flag(rest, "--format") ?? "md";
        if (fmt !== "md" && fmt !== "html") throw new Error("--format must be md or html");
        return { code: 0, out: renderHandoff(loadPlan(rest[0]), fmt, { today: flag(rest, "--today") }), err: "" };
      }
      case "import-stewards": {
        if (!rest[1]) throw new Error("missing steward sheet path");
        const merged = importStewards(loadPlan(rest[0]), parseStewardTable(readFileSync(rest[1], "utf8")));
        const v = validatePlan(merged);
        if (!v.ok) throw new Error(`invalid plan after import:\n  ${v.errors.join("\n  ")}`);
        return { code: 0, out: JSON.stringify(merged, null, 2) + "\n", err: "" };
      }
      case undefined:
      case "help":
      case "--help":
        return { code: cmd ? 0 : 3, out: USAGE + "\n", err: "" };
      default:
        return { code: 3, out: "", err: `unknown command "${cmd}"\n${USAGE}\n` };
    }
  } catch (e) {
    return { code: 3, out: "", err: `${(e as Error).message}\n` };
  }
}

if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  const r = run(argv.slice(2));
  if (r.out) stdout.write(r.out);
  if (r.err) stderr.write(r.err);
  exit(r.code);
}
