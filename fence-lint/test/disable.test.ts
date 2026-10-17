import { describe, it, expect } from 'vitest';
import { lintText } from '../src/index.ts';
import { rules, ctx } from './helpers.ts';

const lint = (t: string) => lintText(t, { profile: 'internal', rules, ctx });

describe('inline fence-lint-disable', () => {
  it('suppresses a finding on the same line when a reason is given, and reports the suppression', () => {
    const r = lint('The word leaderboard is quoted here. <!-- fence-lint-disable F2 -- quoting the rejected proposal verbatim -->');
    expect(r.findings).toEqual([]);
    expect(r.suppressed).toHaveLength(1);
    expect(r.suppressed[0]).toMatchObject({ ruleId: 'F2', reason: 'quoting the rejected proposal verbatim' });
  });
  it('a comment-only line applies to the next non-blank line', () => {
    const r = lint('// fence-lint-disable F7 -- historical record of the old draft\n\nThree strikes and out was the old draft.');
    expect(r.findings).toEqual([]);
    expect(r.suppressed.map((s) => s.ruleId)).toEqual(['F7']);
  });
  it('a disable without a reason is itself an error and suppresses nothing', () => {
    const r = lint('Volunteer leaderboard. <!-- fence-lint-disable F2 -->');
    const ids = r.findings.map((f) => f.ruleId).sort();
    expect(ids).toEqual(['F2', 'FL0']);
    const fl0 = r.findings.find((f) => f.ruleId === 'FL0')!;
    expect(fl0.severity).toBe('error');
    expect(fl0.message).toMatch(/reason/i);
  });
  it('an empty or one-word reason is rejected', () => {
    expect(lint('Volunteer leaderboard. <!-- fence-lint-disable F2 -- -->').findings.some((f) => f.ruleId === 'FL0')).toBe(true);
    expect(lint('Volunteer leaderboard. <!-- fence-lint-disable F2 -- ok -->').findings.some((f) => f.ruleId === 'FL0')).toBe(true);
  });
  it('an unknown rule id is an error', () => {
    const r = lint('# fence-lint-disable F99 -- this rule does not exist at all');
    expect(r.findings.map((f) => f.ruleId)).toEqual(['FL0']);
  });
  it('only disables the named rule', () => {
    const r = lint('Leaderboard of three strikes. <!-- fence-lint-disable F2 -- quoting the rejected proposal verbatim -->');
    expect(r.findings.map((f) => f.ruleId)).toEqual(['F7']);
  });
  it('the disable comment text itself is not linted', () => {
    const r = lint('Fine line. <!-- fence-lint-disable F4 -- reason mentions a leaderboard and three strikes -->');
    expect(r.findings).toEqual([]);
  });
});
