import fs from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from './rules.ts';
import type { Context, Term } from './types.ts';

export interface ContextOptions {
  /** Roster file: one person per line, aliases separated by "|", "#" comments. */
  rosterPath?: string;
  /** Extra term files (JSON {terms:[...]} or plain text, one term per line). */
  termPaths?: string[];
  ladderPath?: string;
  configDir?: string;
}

export function parseRoster(text: string): string[] {
  const names: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    for (const alias of line.split('|')) {
      const a = alias.trim();
      if (a.length >= 2) names.push(a);
    }
  }
  return names;
}

function readTerms(file: string): Term[] {
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.json')) return (JSON.parse(text) as { terms: Term[] }).terms;
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean)
    .map((term) => ({ term }));
}

export function loadContext(opts: ContextOptions = {}): Context {
  const configDir = opts.configDir ?? path.join(PACKAGE_ROOT, 'config');
  const ladder = JSON.parse(fs.readFileSync(opts.ladderPath ?? path.join(configDir, 'ladder.json'), 'utf8')) as { labels: string[]; rivalLabels?: string[] };
  const person = JSON.parse(fs.readFileSync(path.join(configDir, 'person-words.json'), 'utf8')) as { words: string[] };
  const terms = [path.join(configDir, 'outward-terms.json'), ...(opts.termPaths ?? [])].flatMap(readTerms);
  const roster = opts.rosterPath ? parseRoster(fs.readFileSync(opts.rosterPath, 'utf8')) : [];
  const ladderLower = new Set(ladder.labels.map((l) => l.toLowerCase()));
  return {
    roster,
    personWords: person.words,
    ladder: ladder.labels,
    rivalLabels: (ladder.rivalLabels ?? []).filter((l) => !ladderLower.has(l.toLowerCase())),
    terms,
  };
}
