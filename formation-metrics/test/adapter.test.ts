import { describe, expect, it } from 'vitest';
import { adaptNoteLine, adaptNotes } from '../src/adapter.ts';
import { parseEvent } from '../src/contract.ts';

describe('note-prefix adapter', () => {
  it('turns "RESCUE: <text> by Holder X" into a rescue event with the trailing actor text dropped', () => {
    const e = adaptNoteLine('RESCUE: venue booking finished at the last minute by Holder X', { at: '2026-10-04' });
    expect(e).toEqual({ v: 1, type: 'rescue', at: '2026-10-04', summary: 'venue booking finished at the last minute' });
    expect(JSON.stringify(e)).not.toMatch(/Holder/);
    expect(() => parseEvent(e!)).not.toThrow();
  });

  it('strips trailing name text from GAP lines in dash and parenthesis forms too', () => {
    expect(adaptNoteLine('GAP: nobody picked up the room setup — Holder Y', { at: '2026-10-05' })!.summary).toBe(
      'nobody picked up the room setup',
    );
    expect(adaptNoteLine('GAP: slides not ready (Holder Z)', { at: '2026-10-05' })!.summary).toBe('slides not ready');
    expect(adaptNoteLine('gap: follow-up call missed, per Holder W', { at: '2026-10-05' })!.summary).toBe(
      'follow-up call missed',
    );
  });

  it('STEPPED-IN keeps the opaque actor id as recognition (no-shame rule)', () => {
    const e = adaptNoteLine('STEPPED-IN: covered the welcome table by p_4k2m', { at: '2026-10-06' });
    expect(e).toEqual({ v: 1, type: 'stepped_in', at: '2026-10-06', actor: 'p_4k2m', summary: 'covered the welcome table' });
    const leading = adaptNoteLine('STEPPED IN: p_9z1q ran the check-in', { at: '2026-10-06' });
    expect(leading!.actor).toBe('p_9z1q');
  });

  it('STEPPED-IN never stores a human name as the actor', () => {
    const e = adaptNoteLine('STEPPED-IN: covered the welcome table by Holder X', { at: '2026-10-06' });
    expect(e!.actor).toBeUndefined();
    expect(JSON.stringify(e)).not.toMatch(/Holder/);
  });

  it('maps CARD: lines and ignores unprefixed lines', () => {
    expect(adaptNoteLine('CARD: confirm hall for Saturday', { at: '2026-10-07' })!.type).toBe('card');
    expect(adaptNoteLine('just a note', { at: '2026-10-07' })).toBeNull();
    const many = adaptNotes('RESCUE: a by Holder X\nnoise\nGAP: b\nCARD: c', { at: '2026-10-07' });
    expect(many.map((e) => e.type)).toEqual(['rescue', 'gap', 'card']);
  });
});
