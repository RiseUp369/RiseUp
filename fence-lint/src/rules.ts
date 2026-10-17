import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILES, type Rule } from './types.ts';

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_RULES_DIR = path.join(PACKAGE_ROOT, 'rules');

const SOURCE_RE = /^(?:vault|attic)\/(?:[\w.-]+\/)*[\w.-]+\.md$/;

/** Validates one parsed rule object; throws with a precise message on any defect. */
export function validateRule(r: Rule, file = r.id): Rule {
  const bad = (m: string): never => {
    throw new Error(`${file}: ${m}`);
  };
  if (!/^F\d+$/.test(r.id ?? '')) bad('id must look like F<number>');
  if (r.severity !== 'error' && r.severity !== 'warn') bad('severity must be error or warn');
  if (!Array.isArray(r.profiles) || r.profiles.length === 0) bad('profiles must be a non-empty array');
  for (const p of r.profiles) if (!PROFILES.includes(p)) bad(`unknown profile ${p}`);
  if (typeof r.source !== 'string' || !SOURCE_RE.test(r.source) || r.source.includes('..')) bad('source must be a vault/ or attic/ .md path');
  if (typeof r.rationale !== 'string' || r.rationale.trim().length === 0) bad('rationale is required');
  if (r.scope !== 'line' && r.scope !== 'sentence') bad('scope must be line or sentence');
  if (!Array.isArray(r.patterns)) bad('patterns must be an array');
  if (r.patterns.length === 0 && !r.cooccurrence) bad('a rule needs patterns or a cooccurrence check');
  for (const p of r.patterns) if (typeof p.regex !== 'string' || typeof p.message !== 'string') bad('each pattern needs regex and message');
  return r;
}

export function loadRules(dir = DEFAULT_RULES_DIR): Rule[] {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const rules = files.map((f) => validateRule(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Rule, f));
  const ids = new Set<string>();
  for (const r of rules) {
    if (ids.has(r.id)) throw new Error(`duplicate rule id ${r.id}`);
    ids.add(r.id);
  }
  return rules.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}
