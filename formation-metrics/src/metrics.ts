/**
 * Ratified formation metrics and gate calculators. Pure functions, aggregate-only:
 * every result passes through `aggregateOnly`, so no function can return names,
 * person ids, per-person rows, rankings, scores or stage moves.
 */
import type { BeatKey, FormationEvent } from './contract.ts';
import { BEAT_KEYS } from './contract.ts';
import { DEFAULT_CONFIG, type FormationConfig, type OutputKey } from './config.ts';
import { addDays, daysBetween, inRange, quarterRange, toDay } from './dates.ts';
import { aggregateOnly } from './guard.ts';

const ratio = (num: number, den: number): number | undefined => (den === 0 ? undefined : num / den);

// ---------------------------------------------------------------- north star

export interface NorthStarResult {
  quarter: string;
  from: string;
  to: string;
  ownershipEvents: number;
  distinctOwners: number;
  slotsOpened: number;
  ownershipInOpenedSlots: number;
  /** ownershipEvents / slotsOpened; undefined when no slot was deliberately opened. */
  ratio: number | undefined;
  gapsObserved: number;
  note: string;
}

export function northStar(events: readonly FormationEvent[], quarter: string): NorthStarResult {
  const { from, to } = quarterRange(quarter);
  const inQ = events.filter((e) => inRange(e.at, from, to));
  const slots = new Set(inQ.filter((e) => e.type === 'slot.opened').map((e) => e.slotId));
  const ownership = inQ.filter((e) => e.type === 'ownership.unprompted');
  const slotsOpened = inQ.filter((e) => e.type === 'slot.opened').length;
  return aggregateOnly({
    quarter,
    from,
    to,
    ownershipEvents: ownership.length,
    distinctOwners: new Set(ownership.map((e) => e.subject)).size,
    slotsOpened,
    ownershipInOpenedSlots: ownership.filter((e) => e.slotId !== undefined && slots.has(e.slotId)).length,
    ratio: ratio(ownership.length, slotsOpened),
    gapsObserved: inQ.filter((e) => e.type === 'gap').length,
    note:
      'Silence after an unopened gap counts as no evidence: only slots deliberately opened form the denominator, ' +
      'so a gap nobody was invited into is neither a failure nor a success.',
  });
}

// ---------------------------------------------------------------- 14-day ship rate

export interface Entrant {
  day0?: string;
  firstShip?: string;
  beatsDone: BeatKey[];
}

/** Collapse intake events into anonymous entrant records (ids are used for grouping, then dropped). */
export function entrantsFromEvents(events: readonly FormationEvent[]): Entrant[] {
  const bySubject = new Map<string, Entrant>();
  const get = (id: string): Entrant => {
    let e = bySubject.get(id);
    if (!e) bySubject.set(id, (e = { beatsDone: [] }));
    return e;
  };
  const sorted = [...events].sort((a, b) => (toDay(a.at) < toDay(b.at) ? -1 : toDay(a.at) > toDay(b.at) ? 1 : 0));
  for (const ev of sorted) {
    if (!ev.subject) continue;
    if (ev.type === 'intake.day0') {
      const e = get(ev.subject);
      e.day0 ??= toDay(ev.at);
    } else if (ev.type === 'intake.first_ship') {
      const e = get(ev.subject);
      e.firstShip ??= toDay(ev.at);
    } else if (ev.type === 'intake.beat' && ev.beat) {
      const e = get(ev.subject);
      if (!e.beatsDone.includes(ev.beat)) e.beatsDone.push(ev.beat);
    }
  }
  // Map keys (person ids) are discarded here; only anonymous records leave this function.
  return [...bySubject.values()].map((e) => {
    const out: Entrant = { beatsDone: e.beatsDone };
    if (e.day0) out.day0 = e.day0;
    if (e.firstShip) out.firstShip = e.firstShip;
    return out;
  });
}

export interface ShipRateResult {
  asOf: string;
  rate: number | undefined;
  shipped: number;
  /** Entrants who had a Day-0 conversation and whose 14-day window has closed by asOf. */
  denominator: number;
  pending: number;
  excludedNoDay0: number;
  threshold: number;
  belowThreshold: boolean | undefined;
  thresholdStatus: 'threshold not yet validated';
}

/** Day 0 counts as day 1, so the window is day0 .. day0+13 and closes once asOf > day0+13. */
export function shipRate14(
  entrants: readonly Pick<Entrant, 'day0' | 'firstShip'>[],
  asOf: string,
  config: FormationConfig = DEFAULT_CONFIG,
): ShipRateResult {
  let shipped = 0;
  let denominator = 0;
  let pending = 0;
  let excludedNoDay0 = 0;
  for (const e of entrants) {
    if (!e.day0) {
      excludedNoDay0++;
      continue;
    }
    const windowEnd = addDays(e.day0, 13);
    if (toDay(asOf) <= windowEnd) {
      pending++;
      continue;
    }
    denominator++;
    if (e.firstShip && toDay(e.firstShip) >= e.day0 && toDay(e.firstShip) <= windowEnd) shipped++;
  }
  const rate = ratio(shipped, denominator);
  return aggregateOnly({
    asOf: toDay(asOf),
    rate,
    shipped,
    denominator,
    pending,
    excludedNoDay0,
    threshold: config.shipRateThreshold,
    belowThreshold: rate === undefined ? undefined : rate < config.shipRateThreshold,
    thresholdStatus: 'threshold not yet validated' as const,
  });
}

// ---------------------------------------------------------------- intake capacity

export interface IntakeCapacityInput {
  activeWelcomers: number;
  availableHours: number;
  hoursPerEntrant: number;
}

export interface IntakeCapacityResult {
  capacity: number;
  welcomerTerm: number;
  hoursTerm: number;
  bindingConstraint: 'welcomers' | 'hours' | 'tie';
  formula: string;
}

export function intakeCapacity(input: IntakeCapacityInput, config: FormationConfig = DEFAULT_CONFIG): IntakeCapacityResult {
  const { activeWelcomers, availableHours, hoursPerEntrant } = input;
  if (!Number.isInteger(activeWelcomers) || activeWelcomers < 0) throw new RangeError('activeWelcomers must be a non-negative integer');
  if (!Number.isFinite(availableHours) || availableHours < 0) throw new RangeError('availableHours must be a non-negative number');
  if (!Number.isFinite(hoursPerEntrant) || hoursPerEntrant <= 0) throw new RangeError('hoursPerEntrant must be a positive number');
  const welcomerTerm = activeWelcomers * config.entrantsPerWelcomer;
  const hoursTerm = Math.floor(availableHours / hoursPerEntrant);
  return aggregateOnly({
    capacity: Math.min(welcomerTerm, hoursTerm),
    welcomerTerm,
    hoursTerm,
    bindingConstraint: welcomerTerm === hoursTerm ? ('tie' as const) : welcomerTerm < hoursTerm ? ('welcomers' as const) : ('hours' as const),
    formula: `min(activeWelcomers x ${config.entrantsPerWelcomer}, floor(availableHours / hoursPerEntrant))`,
  });
}

// ---------------------------------------------------------------- activation beats

export const BEATS: ReadonlyArray<{ key: BeatKey; dueDay: number; label: string }> = [
  { key: 'named_human_thanks', dueDay: 2, label: 'Named human plus a personal thank-you (within 48h)' },
  { key: 'real_task', dueDay: 3, label: 'A real task in hand (day 3)' },
  { key: 'feedback', dueDay: 10, label: 'One feedback moment (day 10)' },
  { key: 'social_tie', dueDay: 14, label: 'One social tie (day 14)' },
];

export interface ActivationBeatsResult {
  day0: string;
  asOf: string;
  /** asOf expressed as an intake day, with Day 0 = day 1. */
  intakeDay: number;
  beats: Array<{ key: BeatKey; label: string; dueDay: number; due: string; done: boolean; overdue: boolean }>;
}

export function activationBeats(day0: string, asOf: string, completed: readonly BeatKey[] = []): ActivationBeatsResult {
  for (const c of completed) if (!BEAT_KEYS.includes(c)) throw new RangeError(`unknown beat ${c}`);
  const start = toDay(day0);
  const now = toDay(asOf);
  return aggregateOnly({
    day0: start,
    asOf: now,
    intakeDay: daysBetween(start, now) + 1,
    beats: BEATS.map((b) => {
      const due = addDays(start, b.dueDay - 1);
      const done = completed.includes(b.key);
      return { key: b.key, label: b.label, dueDay: b.dueDay, due, done, overdue: !done && now > due };
    }),
  });
}

// ---------------------------------------------------------------- Probe 1 exit gate

export interface Probe1Input {
  deliverableShipped: boolean;
  unpromptedMovesByNonCoDriver: number;
  decisionLogEntries: number;
}

interface Criterion<T> {
  pass: boolean;
  value: T;
  required: string;
}

export interface Probe1Result {
  criteria: {
    deliverableShipped: Criterion<boolean>;
    unpromptedMoveByNonCoDriver: Criterion<number>;
    decisionLogSufficient: Criterion<number>;
  };
  pass: boolean;
  failing: Array<'deliverableShipped' | 'unpromptedMoveByNonCoDriver' | 'decisionLogSufficient'>;
  note: string;
}

export function probe1ExitGate(input: Probe1Input, config: FormationConfig = DEFAULT_CONFIG): Probe1Result {
  const criteria = {
    deliverableShipped: {
      pass: input.deliverableShipped === true,
      value: input.deliverableShipped === true,
      required: 'the sprint deliverable has shipped, at any quality',
    },
    unpromptedMoveByNonCoDriver: {
      pass: input.unpromptedMovesByNonCoDriver >= config.probe1MinUnpromptedMoves,
      value: input.unpromptedMovesByNonCoDriver,
      required: `at least ${config.probe1MinUnpromptedMoves} unprompted move by someone other than the co-driver`,
    },
    decisionLogSufficient: {
      pass: input.decisionLogEntries >= config.probe1MinDecisionLogEntries,
      value: input.decisionLogEntries,
      required: `at least ${config.probe1MinDecisionLogEntries} decision-log entries (evidence floor, not a target)`,
    },
  };
  const failing = (Object.keys(criteria) as Array<keyof typeof criteria>).filter((k) => !criteria[k].pass);
  return aggregateOnly({
    criteria,
    pass: failing.length === 0,
    failing,
    note: 'Judged from the decision log and intake log only; no individual is scored. Probe 2 raises the bar to two people.',
  });
}

export function probe1InputsFromEvents(events: readonly FormationEvent[]): Probe1Input {
  return aggregateOnly({
    deliverableShipped: events.some((e) => e.type === 'deliverable.shipped'),
    unpromptedMovesByNonCoDriver: events.filter((e) => e.type === 'ownership.unprompted' && e.byCoDriver !== true).length,
    decisionLogEntries: events.filter((e) => e.type === 'decision.logged').length,
  });
}

// ---------------------------------------------------------------- pod pilot

export interface PodSession {
  podId?: string;
  date: string;
  expected: number;
  attended: number;
  founderRescue: boolean;
  facilitatorHours?: number;
}

export type CircleDimension =
  | 'attendance'
  | 'continuation_without_founder_rescue'
  | 'facilitator_load'
  | 'trust'
  | 'shared_ownership'
  | 'output_quality';

export interface PodPilotResult {
  sessions: number;
  pods: number;
  attendanceRate: number | undefined;
  continuationWithoutFounderRescueRate: number | undefined;
  facilitatorHoursPerSession: number | undefined;
  circleDeferral: {
    rule: string;
    dimensions: Array<{ dimension: CircleDimension; hasEvidence: boolean; how: 'measured' | 'qualitative review' }>;
    missing: CircleDimension[];
    allDimensionsHaveEvidence: boolean;
    note: string;
  };
}

export function podSessionsFromEvents(events: readonly FormationEvent[]): PodSession[] {
  return events
    .filter((e) => e.type === 'pod.session')
    .map((e) => {
      const s: PodSession = {
        podId: e.podId,
        date: toDay(e.at),
        expected: e.expected ?? 0,
        attended: e.attended ?? 0,
        founderRescue: e.founderRescue === true,
      };
      if (e.facilitatorHours !== undefined) s.facilitatorHours = e.facilitatorHours;
      return s;
    });
}

export function podPilotReadout(
  sessions: readonly PodSession[],
  opts: { qualitativeEvidence?: { trust?: boolean; sharedOwnership?: boolean; outputQuality?: boolean } } = {},
): PodPilotResult {
  const expected = sessions.reduce((n, s) => n + s.expected, 0);
  const attended = sessions.reduce((n, s) => n + Math.min(s.attended, s.expected), 0);
  const withHours = sessions.filter((s) => s.facilitatorHours !== undefined);
  const q = opts.qualitativeEvidence ?? {};
  const dimensions: PodPilotResult['circleDeferral']['dimensions'] = [
    { dimension: 'attendance', hasEvidence: expected > 0, how: 'measured' },
    { dimension: 'continuation_without_founder_rescue', hasEvidence: sessions.length > 0, how: 'measured' },
    { dimension: 'facilitator_load', hasEvidence: withHours.length > 0, how: 'measured' },
    { dimension: 'trust', hasEvidence: q.trust === true, how: 'qualitative review' },
    { dimension: 'shared_ownership', hasEvidence: q.sharedOwnership === true, how: 'qualitative review' },
    { dimension: 'output_quality', hasEvidence: q.outputQuality === true, how: 'qualitative review' },
  ];
  const missing = dimensions.filter((d) => !d.hasEvidence).map((d) => d.dimension);
  return aggregateOnly({
    sessions: sessions.length,
    pods: new Set(sessions.map((s) => s.podId ?? '')).size,
    attendanceRate: ratio(attended, expected),
    continuationWithoutFounderRescueRate: ratio(sessions.filter((s) => !s.founderRescue).length, sessions.length),
    facilitatorHoursPerSession: ratio(withHours.reduce((n, s) => n + (s.facilitatorHours ?? 0), 0), withHours.length),
    circleDeferral: {
      rule: 'Defer the 6-8 person Circle until the 3-person pod pilot has evidence on all six dimensions.',
      dimensions,
      missing,
      allDimensionsHaveEvidence: missing.length === 0,
      note: 'Having evidence is not the same as the evidence being good; considering the Circle stays a human decision.',
    },
  });
}

// ---------------------------------------------------------------- five outputs

export const OUTPUT_LABELS: Record<OutputKey, string> = {
  participant_impact: 'Participant impact',
  contributor_creation: 'Contributor creation',
  capability_creation: 'Capability creation',
  leader_creation: 'Leader creation',
  institutional_replication: 'Institutional replication',
};

export interface FiveOutputsResult {
  outputs: Array<{ output: OutputKey; label: string; eventTypes: readonly string[]; count: number }>;
  noData: OutputKey[];
}

export function fiveOutputsCoverage(events: readonly FormationEvent[], config: FormationConfig = DEFAULT_CONFIG): FiveOutputsResult {
  const outputs = (Object.keys(OUTPUT_LABELS) as OutputKey[]).map((output) => {
    const eventTypes = config.outputSources[output];
    return { output, label: OUTPUT_LABELS[output], eventTypes, count: events.filter((e) => eventTypes.includes(e.type)).length };
  });
  return aggregateOnly({ outputs, noData: outputs.filter((o) => o.count === 0).map((o) => o.output) });
}

// ---------------------------------------------------------------- existing signals

export interface ExistingSignalsResult {
  quarter: string;
  rescues: number;
  gaps: number;
  steppedIn: number;
  cards: number;
}

/** The only counts that exist today (rescue, gap, stepped-in), plus cards. Counts only, never actors. */
export function existingSignals(events: readonly FormationEvent[], quarter: string): ExistingSignalsResult {
  const { from, to } = quarterRange(quarter);
  const inQ = events.filter((e) => inRange(e.at, from, to));
  const count = (t: FormationEvent['type']) => inQ.filter((e) => e.type === t).length;
  return aggregateOnly({ quarter, rescues: count('rescue'), gaps: count('gap'), steppedIn: count('stepped_in'), cards: count('card') });
}
