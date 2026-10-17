import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, rules, ctx } from './helpers.ts';
import { runEval, evaluate } from '../src/eval.ts';

describe('evaluation harness', () => {
  it('shipped corpus: recall 1.0 for every rule on bad/, zero false positives on good/', () => {
    const report = runEval(path.join(ROOT, 'corpus'));
    expect(report.ok).toBe(true);
    for (const id of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) {
      expect(report.perRule[id]!.recall, id).toBe(1);
      expect(report.perRule[id]!.tp, id).toBeGreaterThan(0);
    }
    expect(report.goodFalsePositives).toBe(0);
  });

  it('npm run eval exits 0 on the shipped corpus', () => {
    const r = spawnSync(process.execPath, ['--no-warnings', 'src/eval.ts'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/precision/i);
    expect(r.stdout).toMatch(/recall/i);
  });

  it('exits non-zero when recall or good/ precision regresses', () => {
    const r = spawnSync(process.execPath, ['--no-warnings', 'src/eval.ts', '--corpus', 'test/fixtures/regress-corpus'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status).toBe(1);
  });

  it('a missed expected finding drops recall and fails', () => {
    const rep = evaluate(
      [{ name: 'bad/x.md', kind: 'bad', profile: 'internal', text: 'Nothing wrong here.', expect: [{ rule: 'F2', line: 1 }] }],
      { rules, ctx },
    );
    expect(rep.perRule.F2!.recall).toBe(0);
    expect(rep.ok).toBe(false);
  });

  it('a finding on a good/ sample counts as a false positive and fails', () => {
    const rep = evaluate([{ name: 'good/x.md', kind: 'good', profile: 'internal', text: 'The leaderboard is back.', expect: [] }], { rules, ctx });
    expect(rep.goodFalsePositives).toBe(1);
    expect(rep.ok).toBe(false);
  });
});
