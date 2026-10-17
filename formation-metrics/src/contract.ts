/**
 * events.jsonl contract (v1). Mirrors ../event-contract.schema.json.
 * Events use opaque ids only; names, contact details, scores, ranks and
 * stage moves are rejected at parse time.
 */
import { isDay } from './dates.ts';

export const EVENT_TYPES = [
  'slot.opened',
  'ownership.unprompted',
  'intake.day0',
  'intake.first_ship',
  'intake.beat',
  'decision.logged',
  'deliverable.shipped',
  'pod.session',
  'capacity.snapshot',
  'rescue',
  'gap',
  'stepped_in',
  'card',
  'participant.impact',
  'capability.demonstrated',
  'leader.created',
  'replication.signal',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const BEAT_KEYS = ['named_human_thanks', 'real_task', 'feedback', 'social_tie'] as const;
export type BeatKey = (typeof BEAT_KEYS)[number];

export interface FormationEvent {
  v: 1;
  type: EventType;
  /** YYYY-MM-DD or a full ISO timestamp; metrics use the UTC calendar day. */
  at: string;
  /** Provenance pointer (file or note path); never a person. */
  source?: string;
  subject?: string;
  actor?: string;
  slotId?: string;
  podId?: string;
  byCoDriver?: boolean;
  stage?: number;
  beat?: BeatKey;
  expected?: number;
  attended?: number;
  founderRescue?: boolean;
  facilitatorHours?: number;
  activeWelcomers?: number;
  availableHours?: number;
  hoursPerEntrant?: number;
  summary?: string;
}

export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractError';
  }
}

/** Person ids: "p_" + 3-32 lowercase alphanumerics. Other ids: short lowercase prefix + "_" + token. */
export const PERSON_ID = /^p_[a-z0-9]{3,32}$/;
export const OPAQUE_ID = /^[a-z]{1,6}_[a-z0-9]{1,32}$/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

const IDENTITY_KEYS = new Set(['name', 'firstName', 'lastName', 'fullName', 'displayName', 'email', 'phone']);
const RANKING_KEYS = new Set(['rank', 'ranking', 'score', 'scores']);
const COMMON = ['v', 'type', 'at', 'source'] as const;

type FieldKind = 'person' | 'opaque' | 'bool' | 'stage' | 'beat' | 'count' | 'hours' | 'text';
interface TypeSpec {
  required: Record<string, FieldKind>;
  optional: Record<string, FieldKind>;
}

const SPECS: Record<EventType, TypeSpec> = {
  'slot.opened': { required: { slotId: 'opaque' }, optional: {} },
  'ownership.unprompted': {
    required: { subject: 'person' },
    optional: { slotId: 'opaque', byCoDriver: 'bool', stage: 'stage' },
  },
  'intake.day0': { required: { subject: 'person' }, optional: {} },
  'intake.first_ship': { required: { subject: 'person' }, optional: {} },
  'intake.beat': { required: { subject: 'person', beat: 'beat' }, optional: {} },
  'decision.logged': { required: {}, optional: { summary: 'text' } },
  'deliverable.shipped': { required: {}, optional: { summary: 'text' } },
  'pod.session': {
    required: { podId: 'opaque', expected: 'count', attended: 'count', founderRescue: 'bool' },
    optional: { facilitatorHours: 'hours' },
  },
  'capacity.snapshot': {
    required: { activeWelcomers: 'count', availableHours: 'hours', hoursPerEntrant: 'hours' },
    optional: {},
  },
  rescue: { required: {}, optional: { summary: 'text' } },
  gap: { required: {}, optional: { summary: 'text' } },
  stepped_in: { required: {}, optional: { actor: 'person', summary: 'text' } },
  card: { required: {}, optional: { summary: 'text' } },
  'participant.impact': { required: {}, optional: { summary: 'text' } },
  'capability.demonstrated': { required: {}, optional: { summary: 'text' } },
  'leader.created': { required: {}, optional: { summary: 'text' } },
  'replication.signal': { required: {}, optional: { summary: 'text' } },
};

function fail(where: string, msg: string): never {
  throw new ContractError(`${where}${msg}`);
}

function checkKind(where: string, key: string, kind: FieldKind, value: unknown): void {
  switch (kind) {
    case 'person':
      if (typeof value !== 'string' || !PERSON_ID.test(value)) {
        fail(where, `${key} must be an opaque id like "p_7f3a" (lowercase, no spaces), never a name`);
      }
      return;
    case 'opaque':
      if (typeof value !== 'string' || !OPAQUE_ID.test(value)) fail(where, `${key} must be an opaque id like "slot_q4a"`);
      return;
    case 'bool':
      if (typeof value !== 'boolean') fail(where, `${key} must be true or false`);
      return;
    case 'stage':
      if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 5) {
        fail(where, `stage must be an integer 0-5 (labels live in config, not in events)`);
      }
      return;
    case 'beat':
      if (!BEAT_KEYS.includes(value as BeatKey)) fail(where, `beat must be one of ${BEAT_KEYS.join(', ')}`);
      return;
    case 'count':
      if (!Number.isInteger(value) || (value as number) < 0) fail(where, `${key} must be a non-negative integer`);
      return;
    case 'hours':
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(where, `${key} must be a non-negative number`);
      return;
    case 'text':
      if (typeof value !== 'string' || value.length > 280) fail(where, `${key} must be a string of at most 280 characters`);
      return;
  }
}

function scanForbidden(where: string, value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanForbidden(where, v, `${path}[${i}]`));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (IDENTITY_KEYS.has(k)) {
        fail(where, `field "${k}" is not allowed: events carry opaque ids only (no names or contact details)`);
      }
      if (RANKING_KEYS.has(k)) fail(where, `field "${k}" is not allowed: this library never scores or ranks people`);
      scanForbidden(where, v, path ? `${path}.${k}` : k);
    }
  } else if (typeof value === 'string' && EMAIL.test(value)) {
    fail(where, `${path} looks like it contains an email address; events carry opaque ids only`);
  }
}

function parseEventAt(raw: unknown, line?: number): FormationEvent {
  const where = line === undefined ? '' : `line ${line}: `;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) fail(where, 'event must be a JSON object');
  const obj = raw as Record<string, unknown>;
  scanForbidden(where, obj, '');
  if (obj.v !== 1) fail(where, `unsupported contract version ${JSON.stringify(obj.v)} (expected v: 1)`);
  const type = obj.type;
  if (typeof type === 'string' && /^stage[._]/.test(type)) {
    fail(where, `type "${type}" is not allowed: this library never records or emits stage moves (counts may set task size only)`);
  }
  if (typeof type !== 'string' || !(EVENT_TYPES as readonly string[]).includes(type)) {
    fail(where, `unknown event type ${JSON.stringify(type)}`);
  }
  if (typeof obj.at !== 'string' || !(isDay(obj.at) || (isDay(obj.at.slice(0, 10)) && !Number.isNaN(Date.parse(obj.at))))) {
    fail(where, `at must be YYYY-MM-DD or an ISO timestamp`);
  }
  if (obj.source !== undefined && typeof obj.source !== 'string') fail(where, 'source must be a string path');
  const spec = SPECS[type as EventType];
  for (const [k, kind] of Object.entries(spec.required)) {
    if (obj[k] === undefined) fail(where, `${type} requires ${k}`);
    checkKind(where, k, kind, obj[k]);
  }
  for (const [k, v] of Object.entries(obj)) {
    if ((COMMON as readonly string[]).includes(k) || k in spec.required) continue;
    const kind = spec.optional[k];
    if (!kind) fail(where, `unknown field "${k}" for ${type} (the contract is closed so names cannot hide under other keys)`);
    if (v !== undefined) checkKind(where, k, kind, v);
  }
  return obj as unknown as FormationEvent;
}

/** Validate one event object. Throws ContractError with a clear message. */
export const parseEvent: ((raw: unknown) => FormationEvent) & { types: readonly string[] } = Object.assign(
  (raw: unknown) => parseEventAt(raw),
  { types: EVENT_TYPES },
);

/** Parse events.jsonl text. Blank lines and lines starting with # are skipped. */
export function parseJsonl(text: string): FormationEvent[] {
  const out: FormationEvent[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      throw new ContractError(`line ${i + 1}: not valid JSON`);
    }
    out.push(parseEventAt(raw, i + 1));
  });
  return out;
}
