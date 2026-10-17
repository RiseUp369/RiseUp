/**
 * ai-setup-trifecta: block any AI-assistant setup that combines all three legs of the
 * "lethal trifecta" (private data + untrusted content + external communication).
 *
 * Idea credit: Simon Willison, "The lethal trifecta for AI agents"
 * https://simonwillison.net/2025/jun/16/the-lethal-trifecta/
 *
 * Pure functions only: no I/O, no network, no dependencies. Synthetic data only.
 */

export const LEGS = ["private_data", "untrusted_content", "external_comms"] as const;
export type Leg = (typeof LEGS)[number];

export interface Tool {
  id: string;
  label?: string;
  legs: Leg[];
}

/** A declared guardrail/filter. Recorded, never trusted to change a verdict. */
export interface Mitigation {
  kind: string;
  label?: string;
}

export interface Setup {
  id: string;
  label?: string;
  tools: Tool[];
  mitigations: Mitigation[];
}

export type Verdict = "BLOCKED" | "ALLOWED";

export interface LegCoverage {
  leg: Leg;
  toolIds: string[];
}

export interface SetupResult {
  setupId: string;
  label?: string;
  verdict: Verdict;
  /** Always all three legs, in vocabulary order; toolIds is empty for a missing leg. */
  legs: LegCoverage[];
  /** For BLOCKED: the leg with the fewest contributing tools (ties: vocabulary order). */
  removeLeg: LegCoverage | null;
  mitigationKinds: string[];
}

export type Parsed = { ok: true; setups: Setup[] } | { ok: false; errors: string[] };
export type Checked = { ok: true; results: SetupResult[] } | { ok: false; errors: string[] };

// --- real-data tripwire -----------------------------------------------------

const BANNED_KEYS = new Set(["name", "email", "phone"]);
const EMAIL_LIKE = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[a-z]{2,}/i;

/** Quote a value for an error message without ever repeating something email-like. */
function show(value: unknown): string {
  if (typeof value === "string" && EMAIL_LIKE.test(value)) return "(redacted email-like value)";
  return JSON.stringify(value) ?? String(value);
}

function tripwire(value: unknown, path: string, errors: string[]): void {
  if (typeof value === "string") {
    if (EMAIL_LIKE.test(value)) {
      errors.push(`${path}: value looks like an email address; real data is not allowed, use a synthetic label`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => tripwire(item, `${path}[${i}]`, errors));
    return;
  }
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const shownKey = EMAIL_LIKE.test(key) ? "(redacted)" : key;
      if (BANNED_KEYS.has(key.toLowerCase())) {
        errors.push(`${path}.${shownKey}: key "${shownKey}" is not allowed (real-data tripwire); use "label" for display text`);
      }
      tripwire(child, `${path}.${shownKey}`, errors);
    }
  }
}

// --- validation -------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isLeg(v: unknown): v is Leg {
  return typeof v === "string" && (LEGS as readonly string[]).includes(v);
}

function checkLabel(raw: Record<string, unknown>, where: string, errors: string[]): string | undefined {
  if (raw.label === undefined) return undefined;
  if (typeof raw.label !== "string") {
    errors.push(`${where}: "label" must be a string`);
    return undefined;
  }
  return raw.label;
}

function parseTool(raw: unknown, setupWhere: string, i: number, seen: Set<string>, errors: string[]): Tool | null {
  if (!isObject(raw)) {
    errors.push(`${setupWhere} tools[${i}]: must be an object`);
    return null;
  }
  if (!isNonEmptyString(raw.id)) {
    errors.push(`${setupWhere} tools[${i}]: missing "id"`);
    return null;
  }
  const where = `${setupWhere} tool ${show(raw.id)}`;
  if (seen.has(raw.id)) errors.push(`${where}: duplicate tool id in this setup`);
  seen.add(raw.id);
  const label = checkLabel(raw, where, errors);
  if (!Array.isArray(raw.legs)) {
    errors.push(`${where}: "legs" must be an array of ${LEGS.join(", ")}`);
    return null;
  }
  const legs: Leg[] = [];
  for (const leg of raw.legs) {
    if (!isLeg(leg)) {
      errors.push(`${where}: unknown leg ${show(leg)} (allowed: ${LEGS.join(", ")})`);
    } else if (!legs.includes(leg)) {
      legs.push(leg);
    }
  }
  return { id: raw.id, label, legs };
}

function parseMitigations(raw: unknown, where: string, errors: string[]): Mitigation[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    errors.push(`${where}: "mitigations" must be an array`);
    return [];
  }
  const out: Mitigation[] = [];
  raw.forEach((m, i) => {
    if (!isObject(m) || !isNonEmptyString(m.kind)) {
      errors.push(`${where} mitigations[${i}]: must be an object with a "kind" (for example "guardrail" or "filter")`);
      return;
    }
    out.push({ kind: m.kind, label: checkLabel(m, `${where} mitigations[${i}]`, errors) });
  });
  return out;
}

/** Validate a declared setups document. Returns every problem found, not just the first. */
export function validate(input: unknown): Parsed {
  const errors: string[] = [];
  tripwire(input, "$", errors);
  if (!isObject(input) || !Array.isArray(input.setups)) {
    errors.push('top level must be an object with a "setups" array');
    return { ok: false, errors };
  }
  if (input.setups.length === 0) errors.push('"setups" is empty; nothing to check');

  const setups: Setup[] = [];
  const seenSetups = new Set<string>();
  input.setups.forEach((raw, i) => {
    if (!isObject(raw)) {
      errors.push(`setups[${i}]: must be an object`);
      return;
    }
    if (!isNonEmptyString(raw.id)) {
      errors.push(`setups[${i}]: missing "id"`);
      return;
    }
    const where = `setup ${show(raw.id)}`;
    if (seenSetups.has(raw.id)) errors.push(`${where}: duplicate setup id`);
    seenSetups.add(raw.id);
    const label = checkLabel(raw, where, errors);
    if (!Array.isArray(raw.tools)) {
      errors.push(`${where}: "tools" must be an array`);
      return;
    }
    const seenTools = new Set<string>();
    const tools = raw.tools
      .map((t, j) => parseTool(t, where, j, seenTools, errors))
      .filter((t): t is Tool => t !== null);
    const mitigations = parseMitigations(raw.mitigations, where, errors);
    setups.push({ id: raw.id, label, tools, mitigations });
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, setups };
}

// --- verdict ----------------------------------------------------------------

export function evaluate(setup: Setup): SetupResult {
  const legs: LegCoverage[] = LEGS.map((leg) => ({
    leg,
    toolIds: setup.tools.filter((t) => t.legs.includes(leg)).map((t) => t.id),
  }));
  const present = legs.filter((l) => l.toolIds.length > 0);
  const verdict: Verdict = present.length === LEGS.length ? "BLOCKED" : "ALLOWED";
  // Mitigations are deliberately ignored here. Prompt-injection defences are probabilistic,
  // and in application security a guardrail that stops 95% of attacks is a failing grade.
  // The only reliable fix is to remove a leg.
  const removeLeg =
    verdict === "BLOCKED"
      ? present.reduce((best, l) => (l.toolIds.length < best.toolIds.length ? l : best))
      : null;
  return {
    setupId: setup.id,
    label: setup.label,
    verdict,
    legs,
    removeLeg,
    mitigationKinds: setup.mitigations.map((m) => m.kind),
  };
}

function describeLegs(legs: LegCoverage[]): string {
  return legs.map((l) => `${l.leg}: ${l.toolIds.length > 0 ? l.toolIds.join(", ") : "none"}`).join("; ");
}

/** One plain-language line per setup. */
export function formatLine(r: SetupResult): string {
  const head = `${r.verdict} ${r.setupId}${r.label ? ` (${r.label})` : ""}`;
  const legs = describeLegs(r.legs);
  if (r.verdict === "BLOCKED" && r.removeLeg) {
    const n = r.removeLeg.toolIds.length;
    let line =
      `${head} - has all three legs (${legs}). ` +
      `Remove the ${r.removeLeg.leg} leg: ${n} tool${n === 1 ? "" : "s"} to drop or change (${r.removeLeg.toolIds.join(", ")}).`;
    if (r.mitigationKinds.length > 0) {
      line += ` Declared mitigations (${r.mitigationKinds.join(", ")}) do not change this: a 95% guardrail is still a failing grade.`;
    }
    return line;
  }
  const count = r.legs.filter((l) => l.toolIds.length > 0).length;
  const missing = r.legs.filter((l) => l.toolIds.length === 0).map((l) => l.leg);
  return `${head} - ${count} of 3 legs (${legs}). Safe while ${missing.join(" and ")} ${missing.length > 1 ? "stay" : "stays"} out.`;
}

/** Validate then evaluate a whole document. */
export function checkDocument(input: unknown): Checked {
  const parsed = validate(input);
  if (!parsed.ok) return parsed;
  return { ok: true, results: parsed.setups.map(evaluate) };
}
