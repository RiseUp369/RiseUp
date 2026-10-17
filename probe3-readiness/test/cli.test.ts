import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SOURCES } from "../src/doctrine.ts";
import { ROOT, TODAY } from "./helpers.ts";

function cli(...args: string[]) {
  const r = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "src/cli.ts", ...args],
    { cwd: ROOT, encoding: "utf8" },
  );
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe("cli", () => {
  it("check plan-not-ready exits non-zero and lists every gap with its source path", () => {
    const r = cli("check", "fixtures/plan-not-ready.json", "--today", TODAY);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Verdict: NOT_READY/);
    const gapLines = r.out.split("\n").filter((l) => /^\s*- \[(BLOCKING|SHRINK)\]/.test(l));
    expect(gapLines.length).toBeGreaterThanOrEqual(17);
    const sourceLines = r.out.split("\n").filter((l) => /^\s+source: /.test(l));
    expect(sourceLines.length).toBeGreaterThanOrEqual(gapLines.length);
  });

  it("check plan-ready exits 0 with READY", () => {
    const r = cli("check", "fixtures/plan-ready.json", "--today", TODAY);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Verdict: READY/);
  });

  it("check plan-under-prepared exits 2 with SHRINK_TO_COAST and Branch C guidance", () => {
    const r = cli("check", "fixtures/plan-under-prepared.json", "--today", TODAY);
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/Verdict: SHRINK_TO_COAST/);
    expect(r.out).toContain(SOURCES.branchC);
  });

  it("check --json emits machine-readable output; --max-per-holder overrides the plan", () => {
    const r = cli("check", "fixtures/plan-not-ready.json", "--json", "--max-per-holder", "9", "--today", TODAY);
    const j = JSON.parse(r.out);
    expect(j.verdict).toBe("NOT_READY");
    expect(j.gaps.map((g: { code: string }) => g.code)).not.toContain("HOLDER_OVERLOAD");
  });

  it("drill, handoff and import-stewards write to stdout only", () => {
    expect(cli("drill", "fixtures/plan-ready.json", "--date", TODAY).out).toMatch(/Inject 1/);
    expect(cli("handoff", "fixtures/plan-ready.json", "--format", "html", "--today", TODAY).out).toMatch(/^<!doctype html>/);
    const merged = JSON.parse(cli("import-stewards", "fixtures/plan-ready.json", "fixtures/stewards.md").out);
    expect(merged.scope.some((s: { title: string }) => s.title === "Book the venue")).toBe(true);
  });

  it("invalid input exits 3 with schema errors", () => {
    const r = cli("check", "package.json");
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/invalid plan/i);
  });

  it("source has no network calls and no runtime imports beyond node built-ins", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
    for (const f of readdirSync(join(ROOT, "src"))) {
      const src = readFileSync(join(ROOT, "src", f), "utf8");
      expect(src, f).not.toMatch(/\bfetch\s*\(|node:https?|node:net|node:dgram|XMLHttpRequest|WebSocket/);
      const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
      for (const i of imports) expect(i.startsWith("node:") || i.startsWith("./"), `${f}: ${i}`).toBe(true);
      expect(src, f).not.toMatch(/writeFileSync|appendFileSync|createWriteStream/);
    }
  });
});
