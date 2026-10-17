import type { Context, Finding, LintResult, Profile, Rule, Suppressed } from './types.ts';

const KEYWORD = 'fence-lint-disable';
const MIN_REASON_WORDS = 3;
const NEGATORS = new Set([
  'no', 'not', 'never', 'nor', 'none', 'nothing', 'without', 'avoid', 'avoids', 'instead', 'rather', 'stop', 'ban', 'bans', 'banned',
  'forbid', 'forbids', 'forbidden', 'cannot', "can't", "don't", "doesn't", "won't", "isn't", "aren't", "shouldn't", "mustn't",
]);
// "not surprisingly, top performer ..." is not a negation of what follows.
const NOT_NEGATING_NEXT = new Set(['surprisingly', 'doubt', 'only', 'just', 'least', 'wonder', 'question']);

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

function alternation(list: string[]): string {
  return [...new Set(list)].sort((a, b) => b.length - a.length).map(escapeRegex).join('|');
}

/** Replaces {ROSTER} {PERSON} {LADDER} {RIVAL} {TERMS}; returns null when a token's list is empty. */
export function expandTokens(regex: string, ctx: Context): string | null {
  const lists: Record<string, string[]> = {
    ROSTER: ctx.roster,
    PERSON: [...ctx.personWords, ...ctx.roster],
    LADDER: ctx.ladder,
    RIVAL: ctx.rivalLabels,
    TERMS: ctx.terms.map((t) => t.term),
  };
  let missing = false;
  const out = regex.replace(/\{(ROSTER|PERSON|LADDER|RIVAL|TERMS)\}/g, (_, k: string) => {
    const l = lists[k] ?? [];
    if (l.length === 0) missing = true;
    return alternation(l);
  });
  return missing ? null : out;
}

interface Disable {
  ids: string[];
  reason: string;
  disableLine: number;
}

interface Prepared {
  masked: string;
  lineStarts: number[];
  disables: Map<number, Disable[]>;
  errors: Finding[];
}

function lineStartsOf(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

function position(lineStarts: number[], offset: number): { line: number; column: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineStarts[lo]! + 1 };
}

/** Finds disable comments, masks them out of the text (keeping offsets) and validates each one. */
function prepare(text: string, knownIds: Set<string>): Prepared {
  const lines = text.split('\n');
  const maskedLines = [...lines];
  const disables = new Map<number, Disable[]>();
  const errors: Finding[] = [];
  const pending: { lineIdx: number; d: Disable; sameLine: boolean }[] = [];

  lines.forEach((line, idx) => {
    const k = line.indexOf(KEYWORD);
    if (k < 0) return;
    const before = line.slice(0, k);
    const opener = before.match(/(<!--|\/\/|\/\*|#)\s*$/);
    const maskStart = opener ? k - opener[0].length : k;
    const afterKw = line.slice(k + KEYWORD.length);
    const closer = afterKw.search(/-->|\*\//);
    const body = closer >= 0 ? afterKw.slice(0, closer) : afterKw;
    const maskEnd = closer >= 0 ? k + KEYWORD.length + closer + (afterKw.startsWith('-->', closer) ? 3 : 2) : line.length;
    maskedLines[idx] = line.slice(0, maskStart) + ' '.repeat(maskEnd - maskStart) + line.slice(maskEnd);

    const dash = body.indexOf('--');
    const idsPart = dash >= 0 ? body.slice(0, dash) : body;
    const reason = dash >= 0 ? body.slice(dash + 2).trim() : '';
    const ids = idsPart.split(/[\s,]+/).filter(Boolean);
    const err = (message: string) =>
      errors.push({
        ruleId: 'FL0',
        severity: 'error',
        message,
        line: idx + 1,
        column: k + 1,
        endColumn: maskEnd + 1,
        match: line.slice(maskStart, maskEnd).trim(),
      });
    if (ids.length === 0) return err('fence-lint-disable names no rule; write "fence-lint-disable F2 -- reason".');
    const unknown = ids.filter((id) => !knownIds.has(id));
    if (unknown.length) return err(`fence-lint-disable names unknown rule(s): ${unknown.join(', ')}.`);
    const words = reason.split(/\s+/).filter((w) => /\w/.test(w));
    if (words.length < MIN_REASON_WORDS)
      return err(`fence-lint-disable ${ids.join(',')} needs a reason of at least ${MIN_REASON_WORDS} words after "--"; a disable without a reason is not allowed.`);
    const sameLine = maskedLines[idx]!.trim().length > 0;
    pending.push({ lineIdx: idx, d: { ids, reason, disableLine: idx + 1 }, sameLine });
  });

  for (const { lineIdx, d, sameLine } of pending) {
    let target = lineIdx;
    if (!sameLine) {
      target = -1;
      for (let j = lineIdx + 1; j < maskedLines.length; j++) {
        if (maskedLines[j]!.trim()) {
          target = j;
          break;
        }
      }
    }
    if (target < 0) continue;
    const list = disables.get(target + 1) ?? [];
    list.push(d);
    disables.set(target + 1, list);
  }

  const masked = maskedLines.join('\n');
  return { masked, lineStarts: lineStartsOf(masked), disables, errors };
}

interface Segment {
  start: number;
  text: string;
}

const BLOCK_START = /^\s*(?:[-*+>|#]|\d+[.)]\s|[A-Z][A-Z-]+:)/;

function lineSegments(masked: string, lineStarts: number[]): Segment[] {
  return masked.split('\n').map((text, i) => ({ start: lineStarts[i]!, text }));
}

function sentenceSegments(masked: string, lineStarts: number[]): Segment[] {
  const lines = masked.split('\n');
  const blocks: { start: number; end: number }[] = [];
  let cur: { start: number; end: number } | null = null;
  lines.forEach((line, i) => {
    const start = lineStarts[i]!;
    const end = start + line.length;
    if (!line.trim()) {
      cur = null;
      return;
    }
    if (!cur || BLOCK_START.test(line)) {
      cur = { start, end };
      blocks.push(cur);
    } else cur.end = end;
  });
  const out: Segment[] = [];
  for (const b of blocks) {
    const text = masked.slice(b.start, b.end);
    let last = 0;
    for (const m of text.matchAll(/[.!?;]+["'’”)\]]*(?=\s|$)/g)) {
      const end = m.index + m[0].length;
      out.push({ start: b.start + last, text: text.slice(last, end) });
      last = end;
    }
    if (last < text.length) out.push({ start: b.start + last, text: text.slice(last) });
  }
  return out;
}

function negatedBefore(prefix: string, window: number): boolean {
  const words = prefix.toLowerCase().replace(/’/g, "'").match(/[a-z']+/g) ?? [];
  const tail = words.slice(-(window + 1));
  return tail.some((w, i) => NEGATORS.has(w) && !NOT_NEGATING_NEXT.has(tail[i + 1] ?? ''));
}

function compile(src: string, flags = ''): RegExp {
  return new RegExp(src, [...new Set((flags + 'gu').split(''))].join(''));
}

export interface LintOptions {
  profile: Profile | 'all';
  rules: Rule[];
  ctx: Context;
  file?: string;
}

export function lintText(text: string, opts: LintOptions): LintResult {
  const { rules, ctx } = opts;
  const prep = prepare(text.replace(/\r\n/g, '\n'), new Set(rules.map((r) => r.id)));
  const active = rules.filter((r) => opts.profile === 'all' || r.profiles.includes(opts.profile));
  const raw: Finding[] = [];
  const seen = new Set<string>();
  const ladderLower = ctx.ladder.map((l) => l.toLowerCase());
  const termByLower = new Map(ctx.terms.map((t) => [t.term.toLowerCase(), t]));

  const add = (rule: Rule, offset: number, matched: string, message: string, redact = false) => {
    const key = `${rule.id}:${offset}`;
    if (seen.has(key)) return;
    seen.add(key);
    const { line, column } = position(prep.lineStarts, offset);
    raw.push({
      file: opts.file,
      ruleId: rule.id,
      severity: rule.severity,
      message,
      line,
      column,
      endColumn: column + matched.length,
      match: redact ? '[redacted]' : matched,
      source: rule.source,
    });
  };

  const sentences = sentenceSegments(prep.masked, prep.lineStarts);
  const lines = lineSegments(prep.masked, prep.lineStarts);

  for (const rule of active) {
    let segs = rule.scope === 'line' ? lines : sentences;
    if (rule.linePrefix) {
      const pre = new RegExp(rule.linePrefix, 'u');
      segs = segs.filter((s) => pre.test(s.text));
    }
    const unless = (rule.unless ?? []).map((u) => new RegExp(u, 'iu'));
    const patterns = rule.patterns
      .map((p) => ({ p, src: expandTokens(p.regex, ctx) }))
      .filter((x): x is { p: (typeof rule.patterns)[number]; src: string } => x.src !== null)
      .map(({ p, src }) => ({ p, re: compile(src, p.flags) }));
    const co = rule.cooccurrence
      ? { anchor: compile(rule.cooccurrence.anchor, rule.cooccurrence.flags), with: rule.cooccurrence.with.map((w) => new RegExp(w, (rule.cooccurrence!.flags ?? '') + 'u')) }
      : null;

    for (const seg of segs) {
      if (unless.some((u) => u.test(seg.text))) continue;
      for (const { p, re } of patterns) {
        for (const m of seg.text.matchAll(re)) {
          if (rule.negationWindow && negatedBefore(seg.text.slice(0, m.index), rule.negationWindow)) continue;
          let message = p.message;
          if (p.labelAllow === 'ladder') {
            const label = m.groups?.label;
            if (!label) continue;
            const idx = ladderLower.indexOf(label.toLowerCase());
            const num = m.groups?.num !== undefined ? Number(m.groups.num) : undefined;
            if (idx >= 0 && (num === undefined || num === idx)) continue;
            message =
              idx >= 0
                ? `Stage ${num} is "${ctx.ladder[num!] ?? 'not on the ladder'}" on the ladder, not "${label}".`
                : `"${label}" is not a ladder stage. Ladder: ${ctx.ladder.map((l, i) => `${i} ${l}`).join(', ')}.`;
          }
          if (p.suggestFrom === 'terms') {
            const t = termByLower.get(m[0].toLowerCase().replace(/\s+/g, ' '));
            if (t?.suggest) message = `${message} "${m[0]}": try "${t.suggest}".`;
            else message = `${message} "${m[0]}".`;
          }
          add(rule, seg.start + m.index, m[0], message, p.redact);
        }
      }
      if (co && co.with.every((w) => w.test(seg.text))) {
        for (const m of seg.text.matchAll(co.anchor)) {
          add(rule, seg.start + m.index, m[0], rule.cooccurrence!.message);
          break;
        }
      }
    }
  }

  const findings: Finding[] = [...prep.errors.map((e) => ({ ...e, file: opts.file }))];
  const suppressed: Suppressed[] = [];
  for (const f of raw) {
    const d = prep.disables.get(f.line)?.find((x) => x.ids.includes(f.ruleId));
    if (d) suppressed.push({ ...f, reason: d.reason, disableLine: d.disableLine });
    else findings.push(f);
  }
  const order = (a: Finding, b: Finding) => a.line - b.line || a.column - b.column || a.ruleId.localeCompare(b.ruleId);
  return { findings: findings.sort(order), suppressed: suppressed.sort(order) };
}
