import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.ts';

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

describe('hygiene: no runtime deps, no network, no writes, synthetic data only', () => {
  it('package.json has no runtime dependencies and pins dev dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.dependencies ?? {}).toEqual({});
    for (const v of Object.values(pkg.devDependencies as Record<string, string>)) expect(v).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('src/ imports only node:fs, node:path, node:url, node:process and local files, and never writes files or opens sockets', () => {
    for (const f of walk(path.join(ROOT, 'src'))) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
        expect(['node:fs', 'node:path', 'node:url', 'node:process'].includes(m[1]!) || m[1]!.startsWith('./'), `${f}: ${m[1]}`).toBe(true);
      }
      expect(src, f).not.toMatch(/\b(?:writeFile|appendFile|mkdir|createWriteStream|rmSync|unlink|fetch\(|XMLHttpRequest|WebSocket)\b/);
      expect(src, f).not.toMatch(/node:(?:http|https|net|dns|tls|child_process|dgram)/);
    }
  });

  it('gitignores *.local.* roster and term files', () => {
    expect(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')).toMatch(/^\*\.local\.\*$/m);
    for (const p of ['roster.local.txt', 'config/terms.local.json', 'fixtures/roster.local.csv']) {
      const r = spawnSync('git', ['check-ignore', '-q', p], { cwd: ROOT });
      if (r.error) return; // git not installed: the .gitignore line above is the contract
      expect(r.status, p).toBe(0);
    }
    // the shipped synthetic roster is NOT ignored
    expect(spawnSync('git', ['check-ignore', '-q', 'fixtures/roster.synthetic.txt'], { cwd: ROOT }).status).toBe(1);
  });

  it('the shipped roster and every corpus sample are flagged SYNTHETIC', () => {
    expect(fs.readFileSync(path.join(ROOT, 'fixtures', 'roster.synthetic.txt'), 'utf8').split('\n')[0]).toContain('SYNTHETIC');
    const samples = [...walk(path.join(ROOT, 'corpus')), ...walk(path.join(ROOT, 'test', 'fixtures'))].filter((f) => f.endsWith('.md'));
    expect(samples.length).toBeGreaterThan(10);
    for (const f of samples) expect(fs.readFileSync(f, 'utf8').split('\n')[0], f).toContain('SYNTHETIC');
  });

  it('every corpus sample is listed in the manifest and vice versa', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'corpus', 'manifest.json'), 'utf8'));
    const listed = new Set<string>(manifest.samples.map((s: { file: string }) => s.file));
    const onDisk = walk(path.join(ROOT, 'corpus')).filter((f) => f.endsWith('.md')).map((f) => path.relative(path.join(ROOT, 'corpus'), f));
    expect([...listed].sort()).toEqual(onDisk.sort());
  });
});
