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
} from '../src/metrics.ts';
import { stageLabel, DEFAULT_CONFIG } from '../src/config.ts';
import { ev } from './helpers.ts';

describe('northStar', () => {
  it('counts unprompted ownership events over slots opened in the quarter', () => {
    const events = [
      ev({ type: 'slot.opened', at: '2026-10-02', slotId: 'slot_a1' }),
      ev({ type: 'slot.opened', at: '2026-11-02', slotId: 'slot_a2' }),
      ev({ type: 'slot.opened', at: '2026-11-09', slotId: 'slot_a3' }),
      ev({ type: 'slot.opened', at: '2026-11-16', slotId: 'slot_a4' }),
      ev({ type: 'ownership.unprompted', at: '2026-10-05', subject: 'p_001', slotId: 'slot_a1' }),
      ev({ type: 'ownership.unprompted', at: '2026-11-20', subject: 'p_002' }),
      ev({ type: 'ownership.unprompted', at: '2026-12-01', subject: 'p_001' }),
    ];
    const r = northStar(events, '2026Q4');
    expect(r.ownershipEvents).toBe(3);
    expect(r.slotsOpened).toBe(4);
    expect(r.ratio).toBe(0.75);
    expect(r.distinctOwners).toBe(2);
    expect(r.ownershipInOpenedSlots).toBe(1);
    expect(r.from).toBe('2026-10-01');
    expect(r.to).toBe('2026-12-31');
  });

  it('zero opened slots gives an undefined ratio, not 0 or Infinity', () => {
    const r = northStar(
      [ev({ type: 'ownership.unprompted', at: '2026-10-05', subject: 'p_001' })],
      '2026Q4',
    );
    expect(r.slotsOpened).toBe(0);
    expect(r.ratio).toBeUndefined();
    expect(r.ratio).not.toBe(0);
    expect(r.ratio).not.toBe(Infinity);
  });

  it('notes that silence after an unopened gap is no evidence and keeps gaps out of the denominator', () => {
    const events = [
      ev({ type: 'gap', at: '2026-10-10' }),
      ev({ type: 'gap', at: '2026-10-11' }),
      ev({ type: 'slot.opened', at: '2026-10-12', slotId: 'slot_b1' }),
    ];
    const r = northStar(events, '2026Q4');
    expect(r.gapsObserved).toBe(2);
    expect(r.slotsOpened).toBe(1);
    expect(r.ratio).toBe(0);
    expect(r.note).toMatch(/silence after an unopened gap counts as no evidence/i);
  });

  it('ignores events outside the quarter, including the boundary days of the neighbours', () => {
    const events = [
      ev({ type: 'slot.opened', at: '2026-09-30', slotId: 'slot_c0' }),
      ev({ type: 'slot.opened', at: '2026-10-01', slotId: 'slot_c1' }),
      ev({ type: 'ownership.unprompted', at: '2026-12-31T23:00:00Z', subject: 'p_003' }),
      ev({ type: 'ownership.unprompted', at: '2027-01-01', subject: 'p_003' }),
    ];
    const r = northStar(events, '2026Q4');
    expect(r.slotsOpened).toBe(1);
    expect(r.ownershipEvents).toBe(1);
  });

  it('rejects a malformed quarter', () => {
    expect(() => northStar([], '2026-Q5')).toThrow(/quarter/i);
  });
});

describe('shipRate14', () => {
  it('computes shipped over entrants who had a Day-0 conversation, with closed windows only', () => {
    const r = shipRate14(
      [
        { day0: '2026-10-01', firstShip: '2026-10-03' },
        { day0: '2026-10-01', firstShip: '2026-10-14' }, // day 14 (day 0 = day 1): counts
        { day0: '2026-10-01', firstShip: '2026-10-15' }, // day 15: too late
        { day0: '2026-10-01' },
        { day0: '2026-11-20' }, // window still open on asOf
        { firstShip: '2026-10-05' }, // no Day-0 conversation: excluded
      ],
      '2026-11-25',
    );
    expect(r.denominator).toBe(4);
    expect(r.shipped).toBe(2);
    expect(r.rate).toBe(0.5);
    expect(r.pending).toBe(1);
    expect(r.excludedNoDay0).toBe(1);
    expect(r.belowThreshold).toBe(false);
    expect(r.threshold).toBe(0.5);
    expect(r.thresholdStatus).toBe('threshold not yet validated');
  });

  it('flags below threshold under 50%', () => {
    const r = shipRate14(
      [{ day0: '2026-10-01', firstShip: '2026-10-02' }, { day0: '2026-10-01' }, { day0: '2026-10-01' }],
      '2026-12-01',
    );
    expect(r.rate).toBeCloseTo(1 / 3);
    expect(r.belowThreshold).toBe(true);
  });

  it('has an undefined rate and no threshold verdict with an empty denominator', () => {
    const r = shipRate14([{ day0: '2026-10-10' }], '2026-10-12');
    expect(r.denominator).toBe(0);
    expect(r.rate).toBeUndefined();
    expect(r.belowThreshold).toBeUndefined();
  });

  it('the window closes after day 14: on day 14 an entrant is still pending', () => {
    const onDay14 = shipRate14([{ day0: '2026-10-01' }], '2026-10-14');
    expect(onDay14.pending).toBe(1);
    expect(onDay14.denominator).toBe(0);
    const onDay15 = shipRate14([{ day0: '2026-10-01' }], '2026-10-15');
    expect(onDay15.denominator).toBe(1);
  });

  it('entrantsFromEvents drops ids and keeps earliest Day-0 and first ship', () => {
    const entrants = entrantsFromEvents([
      ev({ type: 'intake.day0', at: '2026-10-01', subject: 'p_010' }),
      ev({ type: 'intake.first_ship', at: '2026-10-04', subject: 'p_010' }),
      ev({ type: 'intake.first_ship', at: '2026-10-09', subject: 'p_010' }),
      ev({ type: 'intake.day0', at: '2026-10-02', subject: 'p_011' }),
    ]);
    expect(entrants).toHaveLength(2);
    expect(entrants[0]).toEqual({ day0: '2026-10-01', firstShip: '2026-10-04', beatsDone: [] });
    for (const e of entrants) expect(Object.keys(e)).not.toContain('subject');
  });
});

describe('intakeCapacity', () => {
  it('binds on welcomers when hours are plentiful', () => {
    const r = intakeCapacity({ activeWelcomers: 1, availableHours: 100, hoursPerEntrant: 10 });
    expect(r.capacity).toBe(3);
    expect(r.welcomerTerm).toBe(3);
    expect(r.hoursTerm).toBe(10);
    expect(r.bindingConstraint).toBe('welcomers');
  });

  it('binds on hours and floors the hours term (the June-2026 "about 2" reading)', () => {
    const r = intakeCapacity({ activeWelcomers: 2, availableHours: 29, hoursPerEntrant: 12 });
    expect(r.hoursTerm).toBe(2);
    expect(r.capacity).toBe(2);
    expect(r.bindingConstraint).toBe('hours');
  });

  it('names a tie when both terms are equal', () => {
    const r = intakeCapacity({ activeWelcomers: 2, availableHours: 60, hoursPerEntrant: 10 });
    expect(r.capacity).toBe(6);
    expect(r.bindingConstraint).toBe('tie');
  });

  it('rejects non-positive hours per entrant and negative inputs', () => {
    expect(() => intakeCapacity({ activeWelcomers: 1, availableHours: 10, hoursPerEntrant: 0 })).toThrow();
    expect(() => intakeCapacity({ activeWelcomers: -1, availableHours: 10, hoursPerEntrant: 2 })).toThrow();
    expect(() => intakeCapacity({ activeWelcomers: 1.5, availableHours: 10, hoursPerEntrant: 2 })).toThrow();
  });
});

describe('activationBeats', () => {
  it('Day 0 counts as day 1: due dates are day0 + (dueDay - 1)', () => {
    const r = activationBeats('2026-10-01', '2026-10-01');
    expect(r.intakeDay).toBe(1);
    expect(r.beats.map((b) => [b.key, b.dueDay, b.due])).toEqual([
      ['named_human_thanks', 2, '2026-10-02'],
      ['real_task', 3, '2026-10-03'],
      ['feedback', 10, '2026-10-10'],
      ['social_tie', 14, '2026-10-14'],
    ]);
    expect(r.beats.every((b) => !b.overdue)).toBe(true);
  });

  it('a beat is not overdue on its due date, only the day after', () => {
    const onDue = activationBeats('2026-10-01', '2026-10-03');
    expect(onDue.beats.find((b) => b.key === 'real_task')!.overdue).toBe(false);
    expect(onDue.beats.find((b) => b.key === 'named_human_thanks')!.overdue).toBe(true);
    const after = activationBeats('2026-10-01', '2026-10-04');
    expect(after.beats.find((b) => b.key === 'real_task')!.overdue).toBe(true);
  });

  it('completed beats are never overdue', () => {
    const r = activationBeats('2026-10-01', '2026-10-30', ['named_human_thanks', 'real_task', 'feedback', 'social_tie']);
    expect(r.beats.some((b) => b.overdue)).toBe(false);
    expect(r.beats.every((b) => b.done)).toBe(true);
  });

  it('asOf before Day 0 gives intakeDay <= 0 and nothing overdue', () => {
    const r = activationBeats('2026-10-10', '2026-10-08');
    expect(r.intakeDay).toBe(-1);
    expect(r.beats.some((b) => b.overdue)).toBe(false);
  });
});

describe('probe1ExitGate', () => {
  const passing = { deliverableShipped: true, unpromptedMovesByNonCoDriver: 1, decisionLogEntries: 10 };

  it('passes when all three criteria hold', () => {
    const r = probe1ExitGate(passing);
    expect(r.pass).toBe(true);
    expect(r.failing).toEqual([]);
  });

  it('fails on the deliverable criterion alone', () => {
    const r = probe1ExitGate({ ...passing, deliverableShipped: false });
    expect(r.pass).toBe(false);
    expect(r.criteria.deliverableShipped.pass).toBe(false);
    expect(r.criteria.unpromptedMoveByNonCoDriver.pass).toBe(true);
    expect(r.criteria.decisionLogSufficient.pass).toBe(true);
    expect(r.failing).toEqual(['deliverableShipped']);
  });

  it('fails on the unprompted-move criterion alone', () => {
    const r = probe1ExitGate({ ...passing, unpromptedMovesByNonCoDriver: 0 });
    expect(r.pass).toBe(false);
    expect(r.failing).toEqual(['unpromptedMoveByNonCoDriver']);
  });

  it('fails on the decision-log evidence floor alone (9 < 10)', () => {
    const r = probe1ExitGate({ ...passing, decisionLogEntries: 9 });
    expect(r.pass).toBe(false);
    expect(r.failing).toEqual(['decisionLogSufficient']);
  });

  it('derives inputs from events, excluding the co-driver', () => {
    const inputs = probe1InputsFromEvents([
      ev({ type: 'deliverable.shipped', at: '2026-10-20' }),
      ev({ type: 'ownership.unprompted', at: '2026-10-21', subject: 'p_020', byCoDriver: true }),
      ev({ type: 'ownership.unprompted', at: '2026-10-22', subject: 'p_021' }),
      ev({ type: 'decision.logged', at: '2026-10-22' }),
    ]);
    expect(inputs).toEqual({ deliverableShipped: true, unpromptedMovesByNonCoDriver: 1, decisionLogEntries: 1 });
  });
});

describe('podPilotReadout', () => {
  it('aggregates attendance, continuation without founder rescue and facilitator load', () => {
    const r = podPilotReadout([
      { podId: 'pod_a', date: '2026-10-03', expected: 3, attended: 3, founderRescue: false, facilitatorHours: 2 },
      { podId: 'pod_a', date: '2026-10-10', expected: 3, attended: 2, founderRescue: true, facilitatorHours: 3 },
      { podId: 'pod_b', date: '2026-10-04', expected: 3, attended: 1, founderRescue: false, facilitatorHours: 1 },
    ]);
    expect(r.sessions).toBe(3);
    expect(r.pods).toBe(2);
    expect(r.attendanceRate).toBeCloseTo(6 / 9);
    expect(r.continuationWithoutFounderRescueRate).toBeCloseTo(2 / 3);
    expect(r.facilitatorHoursPerSession).toBe(2);
  });

  it('keeps the Circle deferred until all six evidence dimensions have data', () => {
    const r = podPilotReadout([
      { podId: 'pod_a', date: '2026-10-03', expected: 3, attended: 3, founderRescue: false, facilitatorHours: 2 },
    ]);
    expect(r.circleDeferral.allDimensionsHaveEvidence).toBe(false);
    expect(r.circleDeferral.missing).toEqual(['trust', 'shared_ownership', 'output_quality']);
    const full = podPilotReadout(
      [{ podId: 'pod_a', date: '2026-10-03', expected: 3, attended: 3, founderRescue: false, facilitatorHours: 2 }],
      { qualitativeEvidence: { trust: true, sharedOwnership: true, outputQuality: true } },
    );
    expect(full.circleDeferral.allDimensionsHaveEvidence).toBe(true);
  });

  it('has undefined rates with no sessions', () => {
    const r = podPilotReadout([]);
    expect(r.attendanceRate).toBeUndefined();
    expect(r.continuationWithoutFounderRescueRate).toBeUndefined();
    expect(r.facilitatorHoursPerSession).toBeUndefined();
    expect(r.circleDeferral.missing).toHaveLength(6);
  });
});

describe('fiveOutputsCoverage', () => {
  it('lists the outputs that have no data', () => {
    const r = fiveOutputsCoverage([
      ev({ type: 'participant.impact', at: '2026-10-01' }),
      ev({ type: 'intake.first_ship', at: '2026-10-02', subject: 'p_030' }),
    ]);
    expect(r.outputs).toHaveLength(5);
    expect(r.noData).toEqual(['capability_creation', 'leader_creation', 'institutional_replication']);
    expect(r.outputs.find((o) => o.output === 'contributor_creation')!.count).toBe(1);
  });

  it('reports all five as missing on an empty log', () => {
    expect(fiveOutputsCoverage([]).noData).toHaveLength(5);
  });
});

describe('stage labels come from config', () => {
  it('stage 0 is Dormant by default (renamed from Prospect) and can be overridden', () => {
    expect(stageLabel(0)).toBe('Dormant');
    expect(stageLabel(3)).toBe('Owner');
    const legacy = { ...DEFAULT_CONFIG, stageLabels: ['Prospect', ...DEFAULT_CONFIG.stageLabels.slice(1)] };
    expect(stageLabel(0, legacy)).toBe('Prospect');
    expect(() => stageLabel(6)).toThrow(/0.?5/);
  });
});
