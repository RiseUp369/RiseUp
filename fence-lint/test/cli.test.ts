import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, SYN_ROSTER } from './helpers.ts';

const CLI = path.join(ROOT, 'src', 'cli.ts');
function run(args: string[], input?: string) {
  const r = spawnSync(process.execPath, ['--no-warnings', CLI, ...args], { cwd: ROOT, input, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe('fence-lint CLI', () => {
  it('lints a file, prints file:line:col and exits 1 on errors', () => {
    const r = run(['--profile', 'internal', 'corpus/bad/f2-ranking-handoff.md']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/f2-ranking-handoff\.md:\d+:\d+\s+error\s+F2/);
  });
  it('exits 0 on a clean file', () => {
    const r = run(['--profile', 'outward', 'corpus/good/outward-workshop-invite.md']);
    expect(r.code).toBe(0);
  });
  it('reads stdin and prints JSON findings with line and column', () => {
    const r = run(['--format', 'json', '--profile', 'agent-report', '--roster', SYN_ROSTER, '-'], 'ok line\nRESCUE: Bram covered the room booking.\n');
    expect(r.code).toBe(1);
    const j = JSON.parse(r.out);
    expect(j.findings[0]).toMatchObject({ file: '<stdin>', ruleId: 'F1', line: 2, severity: 'error' });
    expect(typeof j.findings[0].column).toBe('number');
    expect(j.summary.errors).toBe(1);
  });
  it('warn-only findings exit 0', () => {
    const r = run(['--profile', 'outward', '-'], 'This circle is not for everyone.\n');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/warn\s+F8/);
  });
  it('--profile selects rules (F6 only in outward)', () => {
    const text = 'Built on the Driver Engine.\n';
    expect(run(['--profile', 'internal', '-'], text).code).toBe(0);
    expect(run(['--profile', 'outward', '-'], text).code).toBe(1);
  });
  it('rejects an unknown profile with exit 2', () => {
    expect(run(['--profile', 'nope', '-'], 'x').code).toBe(2);
  });
  it('lists rules with their sources', () => {
    const r = run(['--list-rules']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('F1');
    expect(r.out).toContain('vault/');
  });
});
