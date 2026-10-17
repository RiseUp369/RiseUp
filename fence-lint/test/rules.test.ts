import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, rules } from './helpers.ts';

const SOURCE_RE = /^(?:vault|attic)\/(?:[\w.-]+\/)*[\w.-]+\.md$/;
const VAULT_ROOT = process.env.FENCE_LINT_VAULT_ROOT ?? '/home/user/jpopenbrain';

describe('rule files (rules as data)', () => {
  it('ships exactly the v1 rules F1-F8 with unique ids', () => {
    expect(rules.map((r) => r.id).sort()).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']);
  });

  it.each(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'])('%s carries id, severity, profiles, rationale and patterns', (id) => {
    const r = rules.find((x) => x.id === id)!;
    expect(['error', 'warn']).toContain(r.severity);
    expect(r.profiles.length).toBeGreaterThan(0);
    for (const p of r.profiles) expect(['outward', 'internal', 'agent-report']).toContain(p);
    expect(r.rationale.length).toBeGreaterThan(20);
    expect(r.patterns.length + (r.cooccurrence ? 1 : 0)).toBeGreaterThan(0);
  });

  it('every rule has a non-empty, well-formed source path into the vault or attic', () => {
    for (const r of rules) {
      expect(r.source, r.id).toMatch(SOURCE_RE);
      expect(r.source.includes('..'), r.id).toBe(false);
    }
  });

  it.skipIf(!fs.existsSync(path.join(VAULT_ROOT, 'vault')))('every source path exists in the brain checkout', () => {
    for (const r of rules) {
      for (const s of [r.source, ...(r.alsoSee ?? [])]) {
        expect(fs.existsSync(path.join(VAULT_ROOT, s)), `${r.id}: ${s}`).toBe(true);
      }
    }
  });

  it('README lists every rule source path', () => {
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    for (const r of rules) expect(readme, r.id).toContain(r.source);
  });

  it('F8 is warn-only and F6/F8 apply only to outward copy', () => {
    const f6 = rules.find((r) => r.id === 'F6')!;
    const f8 = rules.find((r) => r.id === 'F8')!;
    expect(f8.severity).toBe('warn');
    expect(f6.profiles).toEqual(['outward']);
    expect(f8.profiles).toEqual(['outward']);
  });
});
