/**
 * Zero-dependency validator for the subset of JSON Schema 2020-12 used by
 * absence-plan.schema.json, plus two kit rules the schema cannot express:
 * no field named name/email anywhere, and every role reference must be a
 * label declared in `roles`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

type Schema = Record<string, unknown>;

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "absence-plan.schema.json");
let cached: Schema | undefined;

export function loadSchema(): Schema {
  cached ??= JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as Schema;
  return cached;
}

const FORBIDDEN_KEYS = new Set(["name", "email"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function typeMatches(actual: string, expected: string): boolean {
  return actual === expected || (expected === "number" && actual === "integer");
}

function resolve(root: Schema, s: Schema): Schema {
  const ref = s.$ref as string | undefined;
  if (!ref) return s;
  const parts = ref.replace(/^#\//, "").split("/");
  let cur: unknown = root;
  for (const p of parts) cur = (cur as Schema)[p];
  return cur as Schema;
}

function walk(root: Schema, schemaIn: Schema, v: unknown, path: string, errors: string[]): void {
  const s = resolve(root, schemaIn);
  const at = path || "/";
  if ("const" in s && v !== s.const) {
    errors.push(`${at}: must be ${JSON.stringify(s.const)}`);
    return;
  }
  if (Array.isArray(s.enum) && !s.enum.includes(v as never)) {
    errors.push(`${at}: must be one of ${s.enum.map((e) => JSON.stringify(e)).join(", ")}`);
    return;
  }
  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
    const actual = typeOf(v);
    if (!types.some((t) => typeMatches(actual, t))) {
      errors.push(`${at}: expected ${types.join("|")}, got ${actual}`);
      return;
    }
  }
  if (typeof v === "string") {
    if (typeof s.minLength === "number" && v.length < s.minLength) errors.push(`${at}: too short`);
    if (typeof s.maxLength === "number" && v.length > s.maxLength) errors.push(`${at}: too long`);
    if (typeof s.pattern === "string" && !new RegExp(s.pattern).test(v)) errors.push(`${at}: does not match ${s.pattern}`);
    if (s.format === "date" && (!DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)))) {
      errors.push(`${at}: must be a YYYY-MM-DD date`);
    }
  }
  if (typeof v === "number") {
    if (typeof s.minimum === "number" && v < s.minimum) errors.push(`${at}: must be >= ${s.minimum}`);
  }
  if (Array.isArray(v)) {
    if (typeof s.minItems === "number" && v.length < s.minItems) errors.push(`${at}: needs at least ${s.minItems} item(s)`);
    if (s.items) v.forEach((x, i) => walk(root, s.items as Schema, x, `${path}/${i}`, errors));
  } else if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const props = (s.properties ?? {}) as Record<string, Schema>;
    for (const r of (s.required ?? []) as string[]) {
      if (!(r in obj)) errors.push(`${at}: missing required field "${r}"`);
    }
    for (const [k, x] of Object.entries(obj)) {
      if (FORBIDDEN_KEYS.has(k.toLowerCase())) continue; // reported by the privacy pass
      if (props[k]) walk(root, props[k], x, `${path}/${k}`, errors);
      else if (s.additionalProperties === false) errors.push(`${at}: unexpected field "${k}"`);
    }
  }
}

function forbiddenKeys(v: unknown, path: string, errors: string[]): void {
  if (Array.isArray(v)) v.forEach((x, i) => forbiddenKeys(x, `${path}/${i}`, errors));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (FORBIDDEN_KEYS.has(k.toLowerCase())) {
        errors.push(`${path || "/"}: forbidden field "${k.toLowerCase()}" - plans carry role labels only, never names or contacts`);
      }
      forbiddenKeys(x, `${path}/${k}`, errors);
    }
  }
}

function roleRefs(plan: Record<string, any>): Array<[string, string]> {
  const refs: Array<[string, string]> = [];
  const a = plan.absence ?? {};
  refs.push(["/absence/founderRole", a.founderRole], ["/absence/primaryHolder", a.primaryHolder], ["/absence/primaryBackup", a.primaryBackup]);
  (plan.scope ?? []).forEach((s: any, i: number) => refs.push([`/scope/${i}/holder`, s?.holder], [`/scope/${i}/backup`, s?.backup]));
  (plan.emergencyInterrupts ?? []).forEach((e: any, i: number) => refs.push([`/emergencyInterrupts/${i}/firstResponder`, e?.firstResponder]));
  const hb = plan.heartbeat ?? {};
  for (const k of ["peerSession", "asyncPulse", "warmthLoop"]) refs.push([`/heartbeat/${k}/holder`, hb[k]?.holder]);
  return refs.filter(([, v]) => typeof v === "string" && v !== "");
}

export interface ValidationResult { ok: boolean; errors: string[] }

export function validatePlan(plan: unknown): ValidationResult {
  const root = loadSchema();
  const errors: string[] = [];
  forbiddenKeys(plan, "", errors);
  walk(root, root, plan, "", errors);
  if (errors.length === 0 && plan && typeof plan === "object") {
    const p = plan as Record<string, any>;
    const labels = new Set((p.roles as Array<{ label: string }>).map((r) => r.label));
    for (const [path, v] of roleRefs(p)) {
      if (!labels.has(v)) errors.push(`${path}: unknown role label "${v}" - declare it in roles`);
    }
    const founder = p.roles.find((r: { label: string }) => r.label === p.absence.founderRole);
    if (founder && founder.kind !== "founder") errors.push(`/absence/founderRole: role "${founder.label}" must have kind "founder"`);
  }
  return { ok: errors.length === 0, errors };
}
