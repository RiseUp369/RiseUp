import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ContractError, parseEvent, parseJsonl } from '../src/contract.ts';

describe('event contract parser', () => {
  it('accepts a valid event with an opaque id', () => {
    const e = parseEvent({ v: 1, type: 'intake.day0', at: '2026-10-01', subject: 'p_7f3a' });
    expect(e.type).toBe('intake.day0');
  });

  it('rejects a "name" field with a clear error', () => {
    expect(() => parseEvent({ v: 1, type: 'intake.day0', at: '2026-10-01', subject: 'p_7f3a', name: 'Someone' })).toThrow(
      /field "name" is not allowed: events carry opaque ids only/,
    );
  });

  it('rejects an "email" field with a clear error, including the line number from JSONL', () => {
    const text = [
      '{"v":1,"type":"decision.logged","at":"2026-10-01"}',
      '{"v":1,"type":"intake.day0","at":"2026-10-01","subject":"p_7f3a","email":"x@example.org"}',
    ].join('\n');
    expect(() => parseJsonl(text)).toThrow(ContractError);
    expect(() => parseJsonl(text)).toThrow(/line 2: field "email" is not allowed/);
  });

  it('rejects nested name fields and email-shaped values anywhere', () => {
    expect(() =>
      parseEvent({ v: 1, type: 'card', at: '2026-10-01', summary: 'ping someone@example.org' }),
    ).toThrow(/email address/);
  });

  it('rejects a subject that is not an opaque id (e.g. a human name)', () => {
    expect(() => parseEvent({ v: 1, type: 'intake.day0', at: '2026-10-01', subject: 'Holder X' })).toThrow(/opaque id/);
  });

  it('rejects inherited Object.prototype key names as unknown fields', () => {
    for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
      expect(() => parseEvent({ v: 1, type: 'intake.day0', at: '2026-10-01', subject: 'p_7f3a', [key]: 'Someone' })).toThrow(
        new RegExp(`unknown field "${key}"`),
      );
    }
    expect(() => parseJsonl('{"v":1,"type":"intake.day0","at":"2026-10-01","subject":"p_7f3a","__proto__":"Someone"}')).toThrow(
      /unknown field "__proto__"/,
    );
  });

  it('rejects unknown fields so a name cannot hide under another key', () => {
    expect(() => parseEvent({ v: 1, type: 'intake.day0', at: '2026-10-01', subject: 'p_7f3a', volunteer: 'X' })).toThrow(
      /unknown field "volunteer"/,
    );
  });

  it('rejects stage-move event types and string stage labels', () => {
    expect(() => parseEvent({ v: 1, type: 'stage.move', at: '2026-10-01', subject: 'p_7f3a' })).toThrow(/stage moves/);
    expect(() =>
      parseEvent({ v: 1, type: 'ownership.unprompted', at: '2026-10-01', subject: 'p_7f3a', stage: 'Prospect' }),
    ).toThrow(/stage must be an integer 0-5/);
    expect(parseEvent({ v: 1, type: 'ownership.unprompted', at: '2026-10-01', subject: 'p_7f3a', stage: 2 }).type).toBe(
      'ownership.unprompted',
    );
  });

  it('rejects rank and score fields', () => {
    expect(() => parseEvent({ v: 1, type: 'decision.logged', at: '2026-10-01', score: 7 })).toThrow(/"score" is not allowed/);
  });

  it('rejects bad dates, missing required fields and unknown versions', () => {
    expect(() => parseEvent({ v: 1, type: 'decision.logged', at: '01/10/2026' })).toThrow(/at/);
    expect(() => parseEvent({ v: 1, type: 'slot.opened', at: '2026-10-01' })).toThrow(/slotId/);
    expect(() => parseEvent({ v: 2, type: 'decision.logged', at: '2026-10-01' })).toThrow(/version/);
  });

  it('skips blank lines and # comments in JSONL', () => {
    const events = parseJsonl('# synthetic\n\n{"v":1,"type":"decision.logged","at":"2026-10-01"}\n');
    expect(events).toHaveLength(1);
  });

  it('the JSON Schema lists the same event types and forbids additional properties', () => {
    const schema = JSON.parse(readFileSync(new URL('../event-contract.schema.json', import.meta.url), 'utf8'));
    const schemaTypes: string[] = schema.$defs.eventType.enum;
    expect(schemaTypes.sort()).toEqual([...(parseEvent as unknown as { types: string[] }).types].sort());
    expect(JSON.stringify(schema)).toContain('"additionalProperties":false');
  });

  it('the synthetic fixture parses cleanly', () => {
    const text = readFileSync(new URL('../fixtures/events.synthetic.jsonl', import.meta.url), 'utf8');
    expect(parseJsonl(text).length).toBeGreaterThan(20);
  });
});
