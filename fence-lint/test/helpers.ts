import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadRules, loadContext, lintText, type Profile } from '../src/index.ts';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SYN_ROSTER = path.join(ROOT, 'fixtures', 'roster.synthetic.txt');
export const rules = loadRules();
export const ctx = loadContext({ rosterPath: SYN_ROSTER });

/** Returns "RULE@line" keys for every finding (sorted, unique). */
export function hits(text: string, profile: Profile | 'all' = 'all'): string[] {
  const { findings } = lintText(text, { profile, rules, ctx });
  return [...new Set(findings.map((f) => `${f.ruleId}@${f.line}`))].sort();
}

export function ruleHits(text: string, ruleId: string, profile: Profile | 'all' = 'all'): number {
  return hits(text, profile).filter((h) => h.startsWith(`${ruleId}@`)).length;
}
