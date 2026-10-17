import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function run(args: string[]): string {
  return execFileSync(process.execPath, ['src/cli.ts', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

describe('cli report', () => {
  it('prints a Markdown readout of every metric with its source path', () => {
    const md = run(['report', 'fixtures/events.synthetic.jsonl', '--quarter', '2026Q4']);
    expect(md).toMatch(/^# RiseUp formation readout: 2026Q4/m);
    expect(md).toContain('Input: `fixtures/events.synthetic.jsonl`');
    for (const heading of [
      '## North star',
      '## 14-day ship rate',
      '## Intake capacity',
      '## Activation beats',
      '## Probe 1 exit gate',
      '## Pod pilot readout',
      '## Five outputs coverage',
      '## Existing signals',
    ]) {
      expect(md).toContain(heading);
    }
    expect(md.match(/Source: `vault\//g)!.length).toBeGreaterThanOrEqual(7);
    expect(md).toContain('threshold not yet validated');
    expect(md).not.toMatch(/p_[a-z0-9]{3,}/);
  });

  it('exits non-zero with a clear message on a contract violation', () => {
    expect(() => run(['report', 'fixtures/bad.name.jsonl', '--quarter', '2026Q4'])).toThrow(/field "name" is not allowed/);
  });

  it('prints usage for an unknown command', () => {
    expect(() => run(['bogus'])).toThrow(/usage/i);
  });
});
