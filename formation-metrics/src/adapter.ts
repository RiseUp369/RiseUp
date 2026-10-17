/**
 * Note-prefix adapter: maps the note format already in use
 * (RESCUE: / GAP: / STEPPED-IN: / CARD:) onto contract events.
 * It reads note text only and changes no schema.
 *
 * No-shame rule: RESCUE and GAP lines lose any trailing actor text
 * ("by Holder X", "— Holder X", "(Holder X)"), because a rescue or a gap is
 * a fact about the work, not a mark against a person. STEPPED-IN keeps the
 * actor, but only as an opaque id, as recognition. A human name is never kept.
 */
import { parseEvent, type FormationEvent } from './contract.ts';

const PREFIX = /^\s*(RESCUE|GAP|STEPPED[-\s]?IN|CARD)\s*:\s*(.*)$/i;
const PERSON = 'p_[a-z0-9]{3,32}';
const TRAILING_BY_ID = new RegExp(`^(.*?)[,;]?\\s+(?:by|from|thanks to)\\s+(${PERSON})\\s*[.!]?$`);
const LEADING_ID = new RegExp(`^(${PERSON})\\b[\\s,:-]*(.*)$`);
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

/** Remove trailing actor text: "... by X", "..., per X", "... — X", "... (X)". */
export function stripTrailingActor(text: string): string {
  let s = text.replace(EMAIL, '').trim();
  s = s.replace(/\s*\([^()]*\)\s*$/, '');
  s = s.replace(/\s+[—–-]\s+.*$/, '');
  s = s.replace(/[,;]?\s+(?:by|per|from|via|thanks to|courtesy of)\s+.*$/i, '');
  return s.replace(/[\s,;:.—–-]+$/, '').trim();
}

export interface AdaptOptions {
  /** Date of the note (YYYY-MM-DD or ISO). */
  at: string;
  /** Optional provenance path for the note. */
  source?: string;
}

export function adaptNoteLine(line: string, opts: AdaptOptions): FormationEvent | null {
  const m = PREFIX.exec(line);
  if (!m) return null;
  const prefix = m[1]!.toUpperCase().replace(/[-\s]/g, '');
  const body = m[2]!.trim();
  const event: Record<string, unknown> = { v: 1, type: '', at: opts.at };
  if (opts.source) event.source = opts.source;
  let summary: string;
  switch (prefix) {
    case 'RESCUE':
    case 'GAP':
    case 'CARD':
      event.type = prefix === 'RESCUE' ? 'rescue' : prefix === 'GAP' ? 'gap' : 'card';
      summary = stripTrailingActor(body);
      break;
    case 'STEPPEDIN': {
      event.type = 'stepped_in';
      const trailing = TRAILING_BY_ID.exec(body);
      const leading = LEADING_ID.exec(body);
      if (trailing) {
        event.actor = trailing[2];
        summary = stripTrailingActor(trailing[1]!);
      } else if (leading) {
        event.actor = leading[1];
        summary = stripTrailingActor(leading[2]!);
      } else {
        summary = stripTrailingActor(body);
      }
      break;
    }
    default:
      return null;
  }
  if (summary) event.summary = summary.slice(0, 280);
  return parseEvent(event);
}

export function adaptNotes(text: string, opts: AdaptOptions): FormationEvent[] {
  return text
    .split(/\r?\n/)
    .map((l) => adaptNoteLine(l, opts))
    .filter((e): e is FormationEvent => e !== null);
}
