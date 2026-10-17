#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadRules, PACKAGE_ROOT } from './rules.ts';
import { loadContext } from './context.ts';
import { lintText } from './engine.ts';
import type { Context, Profile, Rule } from './types.ts';

export interface Sample {
  name: string;
  kind: 'good' | 'bad';
  profile: Profile | 'all';
  text: string;
  expect: { rule: string; line: number }[];
}

export interface RuleStats {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
}

export interface EvalReport {
  ok: boolean;
  perRule: Record<string, RuleStats>;
  goodFalsePositives: number;
  badUnexpected: number;
  problems: string[];
}

const ratio = (a: number, b: number) => (b === 0 ? 1 : a / b);

/** Scores lint output against labelled samples. A finding matches an expectation on (rule, line). */
export function evaluate(samples: Sample[], opts: { rules: Rule[]; ctx: Context }): EvalReport {
  const ids = [...opts.rules.map((r) => r.id), 'FL0'];
  const counts: Record<string, { tp: number; fp: number; fn: number }> = Object.fromEntries(ids.map((id) => [id, { tp: 0, fp: 0, fn: 0 }]));
  const problems: string[] = [];
  let goodFalsePositives = 0;
  let badUnexpected = 0;

  for (const s of samples) {
    const { findings } = lintText(s.text, { profile: s.profile, rules: opts.rules, ctx: opts.ctx });
    const got = new Set(findings.map((f) => `${f.ruleId}@${f.line}`));
    const want = new Set(s.expect.map((e) => `${e.rule}@${e.line}`));
    for (const k of want) {
      const id = k.split('@')[0]!;
      counts[id] ??= { tp: 0, fp: 0, fn: 0 };
      if (got.has(k)) counts[id].tp++;
      else {
        counts[id].fn++;
        problems.push(`missed   ${s.name}: expected ${k}`);
      }
    }
    for (const k of got) {
      if (want.has(k)) continue;
      const id = k.split('@')[0]!;
      counts[id] ??= { tp: 0, fp: 0, fn: 0 };
      counts[id].fp++;
      if (s.kind === 'good') goodFalsePositives++;
      else badUnexpected++;
      problems.push(`${s.kind === 'good' ? 'false+  ' : 'extra   '} ${s.name}: unexpected ${k}`);
    }
  }

  const perRule: Record<string, RuleStats> = {};
  for (const [id, c] of Object.entries(counts)) perRule[id] = { ...c, precision: ratio(c.tp, c.tp + c.fp), recall: ratio(c.tp, c.tp + c.fn) };
  const hasBad = samples.some((s) => s.kind === 'bad');
  const recallOk = Object.values(perRule).every((r) => r.recall === 1);
  const coverageOk = !hasBad || opts.rules.every((r) => perRule[r.id]!.tp > 0 || samples.every((s) => s.kind === 'good'));
  if (hasBad) for (const r of opts.rules) if (perRule[r.id]!.tp === 0) problems.push(`coverage ${r.id}: no bad/ sample exercises this rule`);
  return { ok: recallOk && coverageOk && goodFalsePositives === 0 && badUnexpected === 0, perRule, goodFalsePositives, badUnexpected, problems };
}

interface Manifest {
  roster?: string;
  samples: { file: string; profile: Profile | 'all'; expect?: { rule: string; line: number }[] }[];
}

export function runEval(corpusDir: string): EvalReport {
  const manifest = JSON.parse(fs.readFileSync(path.join(corpusDir, 'manifest.json'), 'utf8')) as Manifest;
  const rules = loadRules();
  const ctx = loadContext({ rosterPath: manifest.roster ? path.resolve(corpusDir, manifest.roster) : undefined });
  const samples: Sample[] = manifest.samples.map((s) => ({
    name: s.file,
    kind: s.file.startsWith('good/') ? 'good' : 'bad',
    profile: s.profile,
    text: fs.readFileSync(path.join(corpusDir, s.file), 'utf8'),
    expect: s.expect ?? [],
  }));
  return evaluate(samples, { rules, ctx });
}

function main(argv: string[]): number {
  const i = argv.indexOf('--corpus');
  const corpus = path.resolve(i >= 0 ? argv[i + 1]! : path.join(PACKAGE_ROOT, 'corpus'));
  const report = runEval(corpus);
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return report.ok ? 0 : 1;
  }
  const pct = (n: number) => n.toFixed(2);
  const lines = [`fence-lint eval: ${path.relative(process.cwd(), corpus) || corpus}`, 'rule  tp  fp  fn  precision  recall'];
  for (const [id, r] of Object.entries(report.perRule)) {
    if (id === 'FL0' && r.tp + r.fp + r.fn === 0) continue;
    lines.push(`${id.padEnd(4)}  ${String(r.tp).padStart(2)}  ${String(r.fp).padStart(2)}  ${String(r.fn).padStart(2)}  ${pct(r.precision).padStart(9)}  ${pct(r.recall).padStart(6)}`);
  }
  lines.push(`false positives on good/: ${report.goodFalsePositives}; unexpected findings on bad/: ${report.badUnexpected}`);
  for (const p of report.problems) lines.push(`  ${p}`);
  lines.push(report.ok ? 'PASS: recall 1.00 on every rule, no false positives' : 'FAIL: the corpus regressed (see above)');
  process.stdout.write(lines.join('\n') + '\n');
  return report.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
