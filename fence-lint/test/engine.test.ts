import { describe, it, expect } from 'vitest';
import { lintText } from '../src/index.ts';
import { hits, ruleHits, rules, ctx } from './helpers.ts';

describe('F1 names in RESCUE:/GAP: signals', () => {
  it('flags a roster name in a RESCUE: line', () => {
    expect(ruleHits('RESCUE: Bram Placeholder picked up the venue booking late.', 'F1')).toBe(1);
  });
  it('flags a roster alias and a handle in a GAP: line', () => {
    expect(hits('- GAP: flyer print run missed; Fixie owns it\n- GAP: ask @dax.m to re-run').filter((h) => h.startsWith('F1'))).toEqual(['F1@1', 'F1@2']);
  });
  it('does not flag a nameless rescue or a STEPPED-IN credit', () => {
    expect(ruleHits('RESCUE: venue booking picked up two days late.\nSTEPPED-IN: Testa Synthetica covered the venue booking.', 'F1')).toBe(0);
  });
  it('redacts the matched name in the finding', () => {
    const { findings } = lintText('GAP: Zuri Samplewood missed the print run', { profile: 'agent-report', rules, ctx });
    const f = findings.find((x) => x.ruleId === 'F1')!;
    expect(f.match).toBe('[redacted]');
  });
});

describe('F2 ranking or scoring people', () => {
  it('flags a leaderboard and rank #', () => {
    expect(hits('Volunteer leaderboard for October.\nShe is rank #2 this month.')).toEqual(['F2@1', 'F2@2']);
  });
  it('flags a numeric score next to a person reference', () => {
    expect(ruleHits('Each volunteer gets a reliability score of 7 this week.', 'F2')).toBe(1);
    expect(ruleHits('Dax Mockwell: 8/10 for follow-through.', 'F2')).toBe(1);
  });
  it('flags top performer framing', () => {
    expect(ruleHits('Our top performers this cycle carried the event.', 'F2')).toBe(1);
  });
  it('does not flag ranking work items or scoring a session', () => {
    expect(ruleHits('Rank the agenda items by urgency. The session scored 8/10 in the feedback form.', 'F2')).toBe(0);
  });
  it('does not flag a doctrine statement that refuses ranking', () => {
    expect(ruleHits('We never keep a leaderboard of people.', 'F2')).toBe(0);
  });
});

describe('F3 presentation-signal inference', () => {
  it('flags leadership potential inferred from voice', () => {
    expect(ruleHits('Her confident voice suggests strong leadership potential.', 'F3')).toBe(1);
  });
  it('flags empathy read from talk-time', () => {
    expect(ruleHits('He clearly lacks empathy, judging by how little talk-time he took.', 'F3')).toBe(1);
  });
  it('flags a trait attached to an accent', () => {
    expect(ruleHits('A charismatic accent makes him a natural fit.', 'F3')).toBe(1);
  });
  it('does not flag a doctrine statement or neutral facilitation note', () => {
    expect(ruleHits('AI must not infer empathy, personality or charisma from voice or accent.', 'F3')).toBe(0);
    expect(ruleHits('The facilitator tracked talk-time to balance turns; nothing about personality is inferred.', 'F3')).toBe(0);
  });
});

describe('F4 warm-contact and headcount numbers', () => {
  it('flags restated warm-contact counts', () => {
    expect(hits('We are working 6 warm contacts.\nThe warm pool is about 10.\nSee the warm-10 list.').filter((h) => h.startsWith('F4'))).toEqual(['F4@1', 'F4@2', 'F4@3']);
  });
  it('flags a restated headcount', () => {
    expect(ruleHits('We now have 23 active volunteers.', 'F4')).toBe(1);
  });
  it('does not flag "see the tracker" or doctrine caps', () => {
    expect(ruleHits('Warm-contact count: see the tracker. Each welcomer holds at most 3 people in intake, in 3-person pods.', 'F4')).toBe(0);
  });
});

describe('F5 stage words outside the ladder', () => {
  it('flags a rival label used as a stage', () => {
    expect(ruleHits('She is at Stage 0 Prospect.', 'F5')).toBe(1);
    expect(ruleHits('He moved up to the Champion stage.', 'F5')).toBe(1);
  });
  it('flags a stage number/label mismatch', () => {
    expect(ruleHits('Promote to Stage 2 Owner after the review.', 'F5')).toBe(1);
  });
  it('flags stage: with an unknown word', () => {
    expect(ruleHits('stage: apprentice', 'F5')).toBe(1);
  });
  it('accepts ladder labels with matching numbers', () => {
    expect(ruleHits('Stage 3 Owner is the pivotal gate. Stage 0 Dormant is graceful. stage: Trial', 'F5')).toBe(0);
  });
  it('does not flag unrelated uses of the word stage', () => {
    expect(ruleHits('The band plays on the main stage at 7pm. We are interested in stage lighting.', 'F5')).toBe(0);
  });
});

describe('F6 jargon in outward copy', () => {
  it('flags philosophy jargon in outward copy with a suggestion', () => {
    const { findings } = lintText('Join us to explore epistemic architecture.', { profile: 'outward', rules, ctx });
    const f = findings.find((x) => x.ruleId === 'F6')!;
    expect(f).toBeTruthy();
    expect(f.message).toContain('how people really learn');
  });
  it('flags internal and prestige terms', () => {
    expect(ruleHits('Our elite programme runs on the Driver Engine.', 'F6', 'outward')).toBe(1);
  });
  it('does not run on internal documents', () => {
    expect(ruleHits('The Driver Engine ladder governs stages.', 'F6', 'internal')).toBe(0);
  });
  it('does not flag plain outward copy', () => {
    expect(ruleHits('Come learn how people really learn, and help ideas spread in your town.', 'F6', 'outward')).toBe(0);
  });
});

describe('F7 automatic miss-count consequences', () => {
  it('flags three strikes', () => {
    expect(ruleHits('Three strikes and you are out of the pod.', 'F7')).toBe(1);
  });
  it('flags two misses and out', () => {
    expect(ruleHits('Two misses and out: no exceptions.', 'F7')).toBe(1);
    expect(ruleHits('After the second missed check-in the volunteer is automatically removed.', 'F7')).toBe(1);
  });
  it('does not flag the doctrine refusal or a capacity conversation', () => {
    expect(ruleHits('A universal one-miss/two-miss/three-miss rule is not adopted.', 'F7')).toBe(0);
    expect(ruleHits('After two missed deadlines, the welcomer checks in about capacity and fit.', 'F7')).toBe(0);
  });
});

describe('F8 gatekeeping in outer-funnel copy (warn)', () => {
  it('warns on gatekeeping phrasing', () => {
    const { findings } = lintText('This is not for everyone. Only the most committed need apply.', { profile: 'outward', rules, ctx });
    const f8 = findings.filter((f) => f.ruleId === 'F8');
    expect(f8.length).toBe(2);
    expect(f8.every((f) => f.severity === 'warn')).toBe(true);
  });
  it('does not flag open, warm copy or negated gatekeeping', () => {
    expect(ruleHits('Everyone is welcome. No experience needed, and it is not selective.', 'F8', 'outward')).toBe(0);
  });
});

describe('profiles and positions', () => {
  it('reports 1-based line and column', () => {
    const { findings } = lintText('Intro line.\n  The leaderboard is up.', { profile: 'internal', rules, ctx });
    expect(findings[0]).toMatchObject({ ruleId: 'F2', line: 2, column: 7, severity: 'error' });
  });
  it('agent-report profile skips outward-only rules', () => {
    const text = 'Our elite programme. Not for everyone.';
    expect(ruleHits(text, 'F6', 'agent-report') + ruleHits(text, 'F8', 'agent-report')).toBe(0);
    expect(ruleHits(text, 'F6', 'outward') + ruleHits(text, 'F8', 'outward')).toBe(2);
  });
});
