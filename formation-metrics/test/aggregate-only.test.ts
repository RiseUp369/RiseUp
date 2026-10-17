import { describe, expect, it } from 'vitest';
import {
  activationBeats,
  entrantsFromEvents,
  fiveOutputsCoverage,
  intakeCapacity,
  northStar,
  podPilotReadout,
  probe1ExitGate,
  probe1InputsFromEvents,
  shipRate14,
  existingSignals,
  podSessionsFromEvents,
} from '../src/metrics.ts';
import { findPerPersonLeaks, aggregateOnly } from '../src/guard.ts';
import { renderReport } from '../src/report.ts';
import type { FormationEvent } from '../src/contract.ts';
import { parseEvent } from '../src/contract.ts';
import { rng } from './helpers.ts';

const FORBIDDEN = ['name', 'personId', 'rank', 'score'];

function randomEvents(seed: number): FormationEvent[] {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const day = () => `2026-${pick(['10', '11', '12'])}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`;
  const ids = Array.from({ length: 6 }, (_, i) => `p_${seed}x${i}`);
  const out: FormationEvent[] = [];
  const n = 5 + Math.floor(r() * 60);
  for (let i = 0; i < n; i++) {
    const t = pick([
      'slot.opened', 'ownership.unprompted', 'intake.day0', 'intake.first_ship', 'intake.beat', 'decision.logged',
      'deliverable.shipped', 'pod.session', 'capacity.snapshot', 'rescue', 'gap', 'stepped_in', 'card',
      'participant.impact', 'capability.demonstrated', 'leader.created', 'replication.signal',
    ] as const);
    const base = { v: 1, type: t, at: day() } as Record<string, unknown>;
    if (t === 'slot.opened') base.slotId = `slot_${i}`;
    if (t === 'ownership.unprompted' || t.startsWith('intake.')) base.subject = pick(ids);
    if (t === 'ownership.unprompted' && r() < 0.3) base.byCoDriver = true;
    if (t === 'intake.beat') base.beat = pick(['named_human_thanks', 'real_task', 'feedback', 'social_tie']);
    if (t === 'pod.session') Object.assign(base, { podId: pick(['pod_a', 'pod_b']), expected: 3, attended: Math.floor(r() * 4), founderRescue: r() < 0.4, facilitatorHours: Math.floor(r() * 4) });
    if (t === 'capacity.snapshot') Object.assign(base, { activeWelcomers: Math.floor(r() * 4), availableHours: Math.floor(r() * 40), hoursPerEntrant: 1 + Math.floor(r() * 12) });
    if (t === 'stepped_in') base.actor = pick(ids);
    out.push(parseEvent(base));
  }
  return out;
}

function allOutputs(events: FormationEvent[]): unknown[] {
  const asOf = '2026-12-31';
  return [
    northStar(events, '2026Q4'),
    shipRate14(entrantsFromEvents(events), asOf),
    intakeCapacity({ activeWelcomers: 2, availableHours: 20, hoursPerEntrant: 6 }),
    activationBeats('2026-10-01', asOf, ['real_task']),
    probe1ExitGate(probe1InputsFromEvents(events)),
    podPilotReadout(podSessionsFromEvents(events)),
    fiveOutputsCoverage(events),
    existingSignals(events, '2026Q4'),
  ];
}

describe('aggregate-only property', () => {
  it('no output of any metric function carries name/personId/rank/score keys or per-person arrays (200 random logs)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const events = randomEvents(seed);
      const ids = new Set(events.flatMap((e) => [e.subject, e.actor].filter(Boolean) as string[]));
      for (const out of allOutputs(events)) {
        const leaks = findPerPersonLeaks(out);
        expect(leaks, `seed ${seed}`).toEqual([]);
        const json = JSON.stringify(out);
        for (const k of FORBIDDEN) expect(json).not.toContain(`"${k}"`);
        for (const id of ids) expect(json, `seed ${seed} leaked ${id}`).not.toContain(id);
      }
      const md = renderReport(events, { quarter: '2026Q4', sourcePath: 'fixtures/x.jsonl' });
      for (const id of ids) expect(md).not.toContain(id);
    }
  });

  it('the guard itself catches forbidden keys and per-person arrays', () => {
    expect(findPerPersonLeaks({ a: { name: 'x' } })).toEqual(['$.a.name']);
    expect(findPerPersonLeaks({ rows: [{ personId: 'p_1', n: 2 }] })).toContain('$.rows[0].personId');
    expect(findPerPersonLeaks({ ids: ['p_abc', 'p_def'] })).toEqual(['$.ids (array of opaque ids)']);
    expect(findPerPersonLeaks({ ranking: [] })).toEqual(['$.ranking']);
    expect(() => aggregateOnly({ score: 1 })).toThrow(/aggregate-only/);
  });
});
