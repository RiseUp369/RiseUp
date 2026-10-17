import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadContext, lintText } from '../src/index.ts';
import { rules } from './helpers.ts';

// Invented placeholder names with non-ASCII first or last letters. JS `\b` only counts
// ASCII letters as word characters, so these used to slip past F1.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fence-lint-unicode-'));
const rosterPath = path.join(dir, 'roster.synthetic.txt');
fs.writeFileSync(rosterPath, 'José Fictivo|José\nÉlodie Exemplaire|Élodie\nZoë\n');
const ctx = loadContext({ rosterPath });

function f1(text: string): number {
  return lintText(text, { profile: 'all', rules, ctx }).findings.filter((f) => f.ruleId === 'F1').length;
}

describe('roster names with non-ASCII edge letters', () => {
  it('flags a name ending in a non-ASCII letter', () => {
    expect(f1('RESCUE: José picked up the venue booking late.')).toBe(1);
  });
  it('flags a name starting with a non-ASCII letter', () => {
    expect(f1('GAP: Élodie missed the print run.')).toBe(1);
  });
  it('flags a name ending in a diaeresis letter', () => {
    expect(f1('GAP: flyer run slipped; Zoë owns it')).toBe(1);
  });
  it('does not flag a longer word that only starts with a roster name', () => {
    expect(f1('RESCUE: Joséphine-style checklist was late.')).toBe(0);
  });
});
