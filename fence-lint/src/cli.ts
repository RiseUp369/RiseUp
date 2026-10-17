#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadRules, DEFAULT_RULES_DIR, PACKAGE_ROOT } from './rules.ts';
import { loadContext } from './context.ts';
import { lintText } from './engine.ts';
import { formatJson, formatText, type FileReport } from './format.ts';
import { PROFILES, type Profile } from './types.ts';

const HELP = `fence-lint: check agent output and outward copy against RiseUp doctrine fences.

Usage: fence-lint [options] [file ...]      (no files, or "-", reads stdin)

Options:
  --profile <p>    outward | internal | agent-report | all   (default: agent-report)
  --format <f>     text | json                               (default: text; --json is a shortcut)
  --roster <path>  roster file for F1/F2 (one name per line, aliases with "|").
                   Default: $FENCE_LINT_ROSTER, else ./roster.local.txt or <pkg>/roster.local.txt if present.
  --terms <path>   extra F6 terms (.json {terms:[{term,suggest}]} or .txt one per line); repeatable.
  --ladder <path>  ladder config (default config/ladder.json)
  --rules <dir>    rules directory (default rules/)
  --list-rules     print the rules with severity, profiles and source
  -h, --help       this help

Exit codes: 0 no error-severity findings, 1 at least one error, 2 usage or read failure.
Disable inline (reason required, at least 3 words):  <!-- fence-lint-disable F2 -- why this is acceptable -->
`;

function fail(msg: string): never {
  process.stderr.write(`fence-lint: ${msg}\n`);
  process.exit(2);
}

function defaultRoster(): string | undefined {
  const env = process.env.FENCE_LINT_ROSTER;
  if (env) return env;
  for (const p of [path.resolve('roster.local.txt'), path.join(PACKAGE_ROOT, 'roster.local.txt')]) if (fs.existsSync(p)) return p;
  return undefined;
}

function main(argv: string[]): number {
  let profile: Profile | 'all' = 'agent-report';
  let format = 'text';
  let roster: string | undefined;
  let ladder: string | undefined;
  let rulesDir = DEFAULT_RULES_DIR;
  const terms: string[] = [];
  const files: string[] = [];
  let listRules = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const val = () => argv[++i] ?? fail(`${a} needs a value`);
    if (a === '-h' || a === '--help') {
      process.stdout.write(HELP);
      return 0;
    } else if (a === '--profile') {
      const p = val();
      if (p !== 'all' && !PROFILES.includes(p as Profile)) fail(`unknown profile "${p}" (use ${PROFILES.join(', ')} or all)`);
      profile = p as Profile | 'all';
    } else if (a === '--format') {
      format = val();
      if (format !== 'text' && format !== 'json') fail(`unknown format "${format}"`);
    } else if (a === '--json') format = 'json';
    else if (a === '--roster') roster = val();
    else if (a === '--terms') terms.push(val());
    else if (a === '--ladder') ladder = val();
    else if (a === '--rules') rulesDir = val();
    else if (a === '--list-rules') listRules = true;
    else if (a.startsWith('--')) fail(`unknown option ${a}`);
    else files.push(a);
  }

  let rules;
  let ctx;
  try {
    rules = loadRules(rulesDir);
    roster ??= defaultRoster();
    ctx = loadContext({ rosterPath: roster, termPaths: terms, ladderPath: ladder });
  } catch (e) {
    fail((e as Error).message);
  }

  if (listRules) {
    for (const r of rules) process.stdout.write(`${r.id}  ${r.severity.padEnd(5)}  [${r.profiles.join(',')}]  ${r.title}\n      source: ${r.source}\n`);
    return 0;
  }

  if (ctx.roster.length === 0 && format === 'text') {
    process.stderr.write('fence-lint: no roster supplied; F1 checks only @handles and F2 only role words (see --roster).\n');
  }

  if (files.length === 0) files.push('-');
  const reports: FileReport[] = [];
  for (const f of files) {
    let text: string;
    try {
      text = f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(f, 'utf8');
    } catch (e) {
      fail(`cannot read ${f}: ${(e as Error).message}`);
    }
    const name = f === '-' ? '<stdin>' : f;
    const r = lintText(text, { profile, rules, ctx, file: name });
    reports.push({ file: name, ...r });
  }

  process.stdout.write(format === 'json' ? formatJson(reports, profile) : formatText(reports));
  return reports.some((r) => r.findings.some((f) => f.severity === 'error')) ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
