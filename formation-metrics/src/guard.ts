/**
 * Aggregate-only fence. Every metric result passes through `aggregateOnly`,
 * which throws if a result could identify, list or rank individual people.
 * (Approved constraint: visibility must not rank people or create reputation anxiety.)
 */
export const FORBIDDEN_OUTPUT_KEYS = new Set([
  'name', 'firstName', 'lastName', 'fullName', 'displayName', 'email', 'phone',
  'person', 'people', 'personId', 'personIds', 'subject', 'subjects', 'actor', 'actors',
  'rank', 'ranking', 'rankings', 'score', 'scores', 'leaderboard',
  'stageMove', 'stageMoves', 'promotion', 'promotions', 'demotion', 'demotions',
]);

const OPAQUE_ID = /^[a-z]{1,6}_[a-z0-9]{3,32}$/;
const PERSON_ID_PREFIX = /^p_/;

export function findPerPersonLeaks(value: unknown, path = '$'): string[] {
  const leaks: string[] = [];
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((v) => typeof v === 'string' && OPAQUE_ID.test(v) && PERSON_ID_PREFIX.test(v))) {
      leaks.push(`${path} (array of opaque ids)`);
      return leaks;
    }
    value.forEach((v, i) => leaks.push(...findPerPersonLeaks(v, `${path}[${i}]`)));
    return leaks;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_OUTPUT_KEYS.has(k)) leaks.push(`${path}.${k}`);
      else leaks.push(...findPerPersonLeaks(v, `${path}.${k}`));
    }
    return leaks;
  }
  if (typeof value === 'string' && OPAQUE_ID.test(value) && PERSON_ID_PREFIX.test(value)) {
    leaks.push(`${path} (opaque person id)`);
  }
  return leaks;
}

export function aggregateOnly<T>(result: T): T {
  const leaks = findPerPersonLeaks(result);
  if (leaks.length > 0) {
    throw new Error(`aggregate-only fence: result would expose per-person data at ${leaks.join(', ')}`);
  }
  return result;
}
