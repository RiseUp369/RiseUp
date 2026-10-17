// Tests for the lethal-trifecta setup checker. Synthetic data only.
// Idea credit: Simon Willison, https://simonwillison.net/2025/jun/16/the-lethal-trifecta/
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LEGS, checkDocument, evaluate, formatLine, validate } from "../src/trifecta.ts";
import type { Setup } from "../src/trifecta.ts";
import { runCli } from "../src/cli.ts";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(pkgDir, "fixtures", "setups.synthetic.json");
const cliPath = join(pkgDir, "src", "cli.ts");

function doc(setups: unknown[]): unknown {
  return { synthetic: true, setups };
}

function tool(id: string, legs: string[]): Record<string, unknown> {
  return { id, label: `Synthetic ${id}`, legs };
}

function okSetups(input: unknown): Setup[] {
  const parsed = validate(input);
  if (!parsed.ok) assert.fail(`expected valid input, got: ${parsed.errors.join(" | ")}`);
  return parsed.setups;
}

function errorsOf(input: unknown): string[] {
  const parsed = validate(input);
  if (parsed.ok) assert.fail("expected validation errors, got a valid document");
  return parsed.errors;
}

const trifecta = {
  id: "synth-trio",
  label: "Synthetic trio",
  tools: [
    tool("synth-mail-reader", ["private_data", "untrusted_content"]),
    tool("synth-calendar-reader", ["private_data"]),
    tool("synth-web-fetch", ["untrusted_content"]),
    tool("synth-mail-sender", ["external_comms"]),
  ],
};

function runCliProcess(args: string[]) {
  return spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", cliPath, ...args], {
    cwd: pkgDir,
    encoding: "utf8",
  });
}

function withTempJson(content: string, fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "ai-setup-trifecta-"));
  try {
    const path = join(dir, "setups.json");
    writeFileSync(path, content);
    fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- vocabulary -------------------------------------------------------------

test("leg vocabulary is exactly private_data, untrusted_content, external_comms", () => {
  assert.deepEqual([...LEGS], ["private_data", "untrusted_content", "external_comms"]);
});

test("an unknown leg is a validation error naming the setup and tool ids", () => {
  const errors = errorsOf(doc([{ id: "synth-odd", tools: [tool("synth-tool-x", ["private_data", "web_access"])] }]));
  const hit = errors.find((e) => e.includes("web_access"));
  assert.ok(hit, `no unknown-leg error in: ${errors.join(" | ")}`);
  assert.match(hit, /synth-odd/);
  assert.match(hit, /synth-tool-x/);
});

test("structural problems are validation errors", () => {
  assert.ok(errorsOf({ nope: [] }).length > 0);
  assert.ok(errorsOf(doc([])).length > 0, "empty setups list");
  assert.ok(errorsOf(doc([{ id: "synth-a", tools: "x" }])).length > 0, "tools not an array");
  assert.ok(errorsOf(doc([{ id: "synth-a", tools: [{ id: "t", legs: "private_data" }] }])).length > 0, "legs not an array");
  const dupes = errorsOf(doc([{ id: "synth-a", tools: [] }, { id: "synth-a", tools: [] }]));
  assert.ok(dupes.some((e) => /duplicate/.test(e) && e.includes("synth-a")));
  const dupeTools = errorsOf(doc([{ id: "synth-b", tools: [tool("t1", []), tool("t1", [])] }]));
  assert.ok(dupeTools.some((e) => /duplicate/.test(e) && e.includes("synth-b") && e.includes("t1")));
});

// --- verdicts ---------------------------------------------------------------

test("all three legs across tools is BLOCKED and lists contributing tool ids per leg", () => {
  const [setup] = okSetups(doc([trifecta]));
  const result = evaluate(setup);
  assert.equal(result.verdict, "BLOCKED");
  assert.deepEqual(result.legs, [
    { leg: "private_data", toolIds: ["synth-mail-reader", "synth-calendar-reader"] },
    { leg: "untrusted_content", toolIds: ["synth-mail-reader", "synth-web-fetch"] },
    { leg: "external_comms", toolIds: ["synth-mail-sender"] },
  ]);
  assert.deepEqual(result.removeLeg, { leg: "external_comms", toolIds: ["synth-mail-sender"] });

  const line = formatLine(result);
  assert.match(line, /^BLOCKED /);
  assert.ok(!line.includes("\n"), "one line per setup");
  for (const id of ["synth-mail-reader", "synth-calendar-reader", "synth-web-fetch", "synth-mail-sender"]) {
    assert.ok(line.includes(id), `line should name ${id}: ${line}`);
  }
  assert.match(line, /[Rr]emove the external_comms leg/);
});

test("the suggested leg is the one with the fewest contributing tools; ties follow vocabulary order", () => {
  const fewestUntrusted = okSetups(
    doc([{ id: "synth-u", tools: [tool("a", ["private_data"]), tool("b", ["private_data", "external_comms"]), tool("c", ["external_comms"]), tool("d", ["untrusted_content"])] }]),
  )[0];
  assert.equal(evaluate(fewestUntrusted).removeLeg?.leg, "untrusted_content");

  const allOneTool = okSetups(doc([{ id: "synth-solo", tools: [tool("synth-everything", [...LEGS])] }]))[0];
  const solo = evaluate(allOneTool);
  assert.equal(solo.verdict, "BLOCKED", "a single tool carrying all three legs is still the trifecta");
  assert.equal(solo.removeLeg?.leg, "private_data");
});

test("a declared guardrail or filter mitigation does NOT change a BLOCKED verdict (95% is a failing grade)", () => {
  const guarded = {
    ...trifecta,
    id: "synth-guarded",
    mitigations: [
      { kind: "guardrail", label: "Synthetic prompt-injection classifier", claimed_block_rate: 0.95 },
      { kind: "filter", label: "Synthetic outbound URL filter", claimed_block_rate: 0.99 },
    ],
  };
  const [plain, withGuards] = okSetups(doc([trifecta, guarded])).map(evaluate);
  assert.equal(withGuards.verdict, "BLOCKED");
  assert.deepEqual(withGuards.legs, plain.legs);
  assert.deepEqual(withGuards.removeLeg, plain.removeLeg);
  assert.deepEqual(withGuards.mitigationKinds, ["guardrail", "filter"]);
  assert.match(formatLine(withGuards), /do not change/);
});

test("setups with one or two legs (or none) are ALLOWED", () => {
  const results = okSetups(
    doc([
      { id: "synth-none", tools: [tool("synth-calculator", [])] },
      { id: "synth-one", tools: [tool("synth-notes-reader", ["private_data"])] },
      { id: "synth-two-a", tools: [tool("synth-web-fetch", ["untrusted_content"]), tool("synth-webhook", ["external_comms"])] },
      { id: "synth-two-b", tools: [tool("synth-notes-reader", ["private_data"]), tool("synth-mailer", ["external_comms"])] },
      { id: "synth-two-c", tools: [tool("synth-inbox", ["private_data", "untrusted_content"])] },
    ]),
  ).map(evaluate);
  for (const r of results) {
    assert.equal(r.verdict, "ALLOWED", r.setupId);
    assert.equal(r.removeLeg, null);
    assert.match(formatLine(r), /^ALLOWED /);
  }
});

// --- real-data tripwire -----------------------------------------------------

test("keys named name, email or phone are validation errors, at any depth and any case", () => {
  for (const key of ["name", "email", "phone", "Name", "EMAIL"]) {
    const top = errorsOf(doc([{ id: "synth-a", [key]: "Synthetic", tools: [] }]));
    assert.ok(top.some((e) => e.includes(key)), `top-level ${key}: ${top.join(" | ")}`);
    const nested = errorsOf(doc([{ id: "synth-a", tools: [{ ...tool("t1", []), meta: { [key]: "x" } }] }]));
    assert.ok(nested.some((e) => e.includes(key)), `nested ${key}: ${nested.join(" | ")}`);
  }
});

test("any string value that looks like an email address is a validation error and is not echoed back", () => {
  const address = "someone@example.org";
  const errors = errorsOf(doc([{ id: "synth-a", tools: [{ ...tool("t1", []), label: `Reads ${address} inbox` }] }]));
  assert.ok(errors.some((e) => /email/i.test(e)));
  assert.ok(errors.every((e) => !e.includes(address)), "error text must not repeat the address");
  const asLeg = errorsOf(doc([{ id: "synth-a", tools: [tool("t1", [address])] }]));
  assert.ok(asLeg.every((e) => !e.includes(address)), "unknown-leg error must not repeat the address");
});

test("'label' is the accepted display-text key", () => {
  assert.equal(okSetups(doc([{ id: "synth-a", label: "Synthetic helper", tools: [tool("t1", [])] }])).length, 1);
});

// --- fixture ----------------------------------------------------------------

test("the fixture is valid, clearly synthetic, and mixes BLOCKED and ALLOWED setups", () => {
  const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
  assert.equal(raw.synthetic, true);
  const checked = checkDocument(raw);
  if (!checked.ok) assert.fail(checked.errors.join(" | "));
  const verdicts = checked.results.map((r) => r.verdict);
  assert.ok(verdicts.includes("BLOCKED") && verdicts.includes("ALLOWED"));
  for (const s of raw.setups) {
    assert.match(s.id, /^synth-/);
    assert.match(s.label, /^Synthetic /);
    for (const t of s.tools) assert.match(t.id, /^synth-/);
  }
  const guarded = checked.results.find((r) => r.mitigationKinds.length > 0);
  assert.equal(guarded?.verdict, "BLOCKED", "fixture shows a guarded setup that is still blocked");
});

// --- CLI exit codes ---------------------------------------------------------

test("CLI on the fixture prints one line per setup and exits 1 when any setup is BLOCKED", () => {
  const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
  const res = runCliProcess(["check", "fixtures/setups.synthetic.json"]);
  assert.equal(res.status, 1, res.stderr);
  const lines = res.stdout.trimEnd().split("\n");
  assert.equal(lines.length, raw.setups.length);
  for (const [i, s] of raw.setups.entries()) assert.ok(lines[i].includes(s.id));
  assert.ok(lines.some((l) => l.startsWith("BLOCKED ")));
});

test("CLI exits 0 when no setup is BLOCKED", () => {
  const allowed = doc([
    { id: "synth-one", label: "Synthetic one", tools: [tool("synth-notes", ["private_data"])] },
    { id: "synth-two", label: "Synthetic two", tools: [tool("synth-web", ["untrusted_content"]), tool("synth-post", ["external_comms"])] },
  ]);
  withTempJson(JSON.stringify(allowed), (path) => {
    const res = runCliProcess(["check", path]);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout.trimEnd().split("\n").length, 2);
    assert.ok(res.stdout.split("\n").filter(Boolean).every((l) => l.startsWith("ALLOWED ")));
  });
});

test("CLI exits 2 on invalid input: unknown leg, tripwire, bad JSON, missing file, bad usage", () => {
  withTempJson(JSON.stringify(doc([{ id: "synth-x", tools: [tool("synth-y", ["telepathy"])] }])), (path) => {
    const res = runCliProcess(["check", path]);
    assert.equal(res.status, 2);
    assert.equal(res.stdout, "");
    assert.match(res.stderr, /synth-x/);
    assert.match(res.stderr, /synth-y/);
  });
  withTempJson(JSON.stringify(doc([{ id: "synth-x", phone: "000", tools: [] }])), (path) => {
    assert.equal(runCliProcess(["check", path]).status, 2);
  });
  withTempJson("{ not json", (path) => {
    assert.equal(runCliProcess(["check", path]).status, 2);
  });
  assert.equal(runCliProcess(["check", join(pkgDir, "fixtures", "does-not-exist.json")]).status, 2);
  assert.equal(runCliProcess([]).status, 2);
  assert.equal(runCliProcess(["frobnicate", "fixtures/setups.synthetic.json"]).status, 2);
});

test("runCli (in-process) agrees with the subprocess on the fixture", () => {
  const res = runCli(["check", fixturePath]);
  assert.equal(res.code, 1);
  assert.equal(res.err, "");
  assert.equal(res.out, runCliProcess(["check", "fixtures/setups.synthetic.json"]).stdout);
});
