/** Markdown readout. Prints aggregate numbers only; free-text summaries are never printed. */
import type { FormationEvent } from './contract.ts';
import { DEFAULT_CONFIG, stageLabel, type FormationConfig } from './config.ts';
import { quarterRange, toDay, inRange } from './dates.ts';
import {
  activationBeats,
  BEATS,
  entrantsFromEvents,
  existingSignals,
  fiveOutputsCoverage,
  intakeCapacity,
  northStar,
  podPilotReadout,
  podSessionsFromEvents,
  probe1ExitGate,
  probe1InputsFromEvents,
  shipRate14,
} from './metrics.ts';
import { SOURCES } from './sources.ts';

export interface ReportOptions {
  quarter: string;
  sourcePath: string;
  asOf?: string;
  config?: FormationConfig;
}

const pct = (x: number | undefined): string => (x === undefined ? 'n/a (empty denominator)' : `${(x * 100).toFixed(1)}%`);
const num = (x: number | undefined, digits = 2): string => (x === undefined ? 'n/a' : String(Number(x.toFixed(digits))));
const yes = (b: boolean): string => (b ? 'PASS' : 'FAIL');
const src = (key: keyof typeof SOURCES): string => `Source: \`${SOURCES[key].path}\` (${SOURCES[key].status})`;

export function renderReport(events: readonly FormationEvent[], opts: ReportOptions): string {
  const config = opts.config ?? DEFAULT_CONFIG;
  const { from, to } = quarterRange(opts.quarter);
  const latest = events.reduce<string | undefined>((m, e) => (m === undefined || toDay(e.at) > m ? toDay(e.at) : m), undefined);
  const asOf = toDay(opts.asOf ?? latest ?? to);
  const upToAsOf = events.filter((e) => toDay(e.at) <= asOf);
  const L: string[] = [];

  L.push(`# RiseUp formation readout: ${opts.quarter}`, '');
  L.push(`Input: \`${opts.sourcePath}\` (${events.length} events). Quarter ${from} to ${to}. As of ${asOf}.`);
  L.push('Aggregate counts only: no names, no per-person rows, no rankings, no stage moves.', '');

  const ns = northStar(upToAsOf, opts.quarter);
  L.push('## North star: unprompted ownership per opened slot', '');
  L.push('| Measure | Value |', '| --- | --- |');
  L.push(`| Unprompted ownership events | ${ns.ownershipEvents} |`);
  L.push(`| Distinct people taking ownership (count only) | ${ns.distinctOwners} |`);
  L.push(`| Slots deliberately opened | ${ns.slotsOpened} |`);
  L.push(`| Ownership inside an opened slot | ${ns.ownershipInOpenedSlots} |`);
  L.push(`| Ratio (ownership / opened slots) | ${num(ns.ratio)}${ns.ratio === undefined ? ' (no slots opened)' : ''} |`);
  L.push(`| Gaps observed (not in denominator) | ${ns.gapsObserved} |`, '');
  L.push(`${ns.note} The pivotal gate is ${stageLabel(2, config)} (2) to ${stageLabel(3, config)} (3).`, '');
  L.push(src('northStar'), '');

  const entrants = entrantsFromEvents(upToAsOf);
  const sr = shipRate14(entrants, asOf, config);
  L.push('## 14-day ship rate', '');
  L.push('| Measure | Value |', '| --- | --- |');
  L.push(`| Rate | ${pct(sr.rate)} |`);
  L.push(`| Shipped a first task within 14 days | ${sr.shipped} |`);
  L.push(`| Denominator: had a Day-0 conversation, window closed | ${sr.denominator} |`);
  L.push(`| Window still open (pending) | ${sr.pending} |`);
  L.push(`| Excluded: no Day-0 conversation | ${sr.excludedNoDay0} |`);
  L.push(
    `| Below ${pct(sr.threshold)} threshold | ${sr.belowThreshold === undefined ? 'n/a' : sr.belowThreshold ? 'yes: fix the task menu or welcomer practice before widening any funnel' : 'no'} |`,
    '',
  );
  L.push(`The threshold is labelled: ${sr.thresholdStatus}.`, '');
  L.push(src('shipRate14'), '');

  const snap = [...upToAsOf].filter((e) => e.type === 'capacity.snapshot').sort((a, b) => (toDay(a.at) < toDay(b.at) ? -1 : 1)).pop();
  L.push('## Intake capacity', '');
  if (snap) {
    const ic = intakeCapacity(
      { activeWelcomers: snap.activeWelcomers!, availableHours: snap.availableHours!, hoursPerEntrant: snap.hoursPerEntrant! },
      config,
    );
    L.push(`Reading from the snapshot dated ${toDay(snap.at)}: ${ic.formula}.`, '');
    L.push('| Measure | Value |', '| --- | --- |');
    L.push(`| Capacity (concurrent entrants) | ${ic.capacity} |`);
    L.push(`| Welcomer term | ${ic.welcomerTerm} |`);
    L.push(`| Hours term | ${ic.hoursTerm} |`);
    L.push(`| Binding constraint | ${ic.bindingConstraint} |`, '');
    L.push('When the cap binds, cut the number of Day-0 conversations, never the quality of the 14 days.', '');
  } else {
    L.push('No capacity snapshot in the log, so capacity cannot be computed.', '');
  }
  L.push(src('intakeCapacity'), '');

  L.push('## Activation beats (entrants whose Day 0 falls in the quarter)', '');
  const cohort = entrants.filter((e) => e.day0 && inRange(e.day0, from, to) && e.day0 <= asOf);
  const tally = BEATS.map((b) => ({ ...b, due: 0, done: 0, overdue: 0 }));
  for (const e of cohort) {
    const r = activationBeats(e.day0!, asOf, e.beatsDone);
    r.beats.forEach((b, i) => {
      const t = tally[i]!;
      if (b.due <= asOf) t.due++;
      if (b.done) t.done++;
      if (b.overdue) t.overdue++;
    });
  }
  L.push(`Entrants in cohort: ${cohort.length}. Day 0 counts as day 1, matching the shipped intake checklist.`, '');
  L.push('| Beat | Due day | Due by as-of date | Done | Overdue |', '| --- | --- | --- | --- | --- |');
  for (const t of tally) L.push(`| ${t.label} | ${t.dueDay} | ${t.due} | ${t.done} | ${t.overdue} |`);
  L.push('', 'Overdue beats are a prompt for the welcomer, not a mark against the entrant.', '');
  L.push(src('activationBeats'), '');

  const p1 = probe1ExitGate(probe1InputsFromEvents(upToAsOf), config);
  L.push('## Probe 1 exit gate', '');
  L.push('| Criterion | Required | Value | Result |', '| --- | --- | --- | --- |');
  L.push(`| Deliverable shipped | ${p1.criteria.deliverableShipped.required} | ${p1.criteria.deliverableShipped.value ? 'yes' : 'no'} | ${yes(p1.criteria.deliverableShipped.pass)} |`);
  L.push(`| Unprompted move by a non-co-driver | ${p1.criteria.unpromptedMoveByNonCoDriver.required} | ${p1.criteria.unpromptedMoveByNonCoDriver.value} | ${yes(p1.criteria.unpromptedMoveByNonCoDriver.pass)} |`);
  L.push(`| Decision log has enough entries | ${p1.criteria.decisionLogSufficient.required} | ${p1.criteria.decisionLogSufficient.value} | ${yes(p1.criteria.decisionLogSufficient.pass)} |`);
  L.push(`| **Overall** | all three | | **${yes(p1.pass)}** |`, '');
  L.push(p1.note, '');
  L.push(src('probe1ExitGate'), '');

  const pod = podPilotReadout(podSessionsFromEvents(upToAsOf.filter((e) => inRange(e.at, from, to))));
  L.push('## Pod pilot readout (3-person pods)', '');
  L.push('| Measure | Value |', '| --- | --- |');
  L.push(`| Sessions | ${pod.sessions} |`);
  L.push(`| Pods | ${pod.pods} |`);
  L.push(`| Attendance | ${pct(pod.attendanceRate)} |`);
  L.push(`| Continued without founder rescue | ${pct(pod.continuationWithoutFounderRescueRate)} |`);
  L.push(`| Facilitator hours per session | ${num(pod.facilitatorHoursPerSession)} |`, '');
  L.push(`${pod.circleDeferral.rule}`, '');
  L.push('| Dimension | How | Evidence |', '| --- | --- | --- |');
  for (const d of pod.circleDeferral.dimensions) L.push(`| ${d.dimension} | ${d.how} | ${d.hasEvidence ? 'yes' : 'none yet'} |`);
  L.push('', `Circle stays deferred: ${pod.circleDeferral.allDimensionsHaveEvidence ? 'evidence exists on all six; a human decides' : 'yes'}. ${pod.circleDeferral.note}`, '');
  L.push(src('podPilotReadout'), '');

  const fo = fiveOutputsCoverage(upToAsOf.filter((e) => inRange(e.at, from, to)), config);
  L.push('## Five outputs coverage', '');
  L.push('| Output | Counted from | Events |', '| --- | --- | --- |');
  for (const o of fo.outputs) L.push(`| ${o.label} | ${o.eventTypes.map((t) => `\`${t}\``).join(', ')} | ${o.count === 0 ? '**no data**' : o.count} |`);
  L.push('', `No data yet: ${fo.noData.length === 0 ? 'none' : fo.noData.join(', ')}.`, '');
  L.push(src('fiveOutputsCoverage'), '');

  const sig = existingSignals(upToAsOf, opts.quarter);
  L.push('## Existing signals (from note prefixes)', '');
  L.push('| Signal | Count |', '| --- | --- |');
  L.push(`| RESCUE | ${sig.rescues} |`, `| GAP | ${sig.gaps} |`, `| STEPPED-IN | ${sig.steppedIn} |`, `| CARD | ${sig.cards} |`, '');
  L.push('Counts only. Rescue and gap lines carry no actor; stepped-in recognition stays in the source notes.', '');
  L.push(src('noShame'), '');
  L.push(`Stage moves are never computed here: ${SOURCES.noStageMoves.path}.`, '');
  return L.join('\n');
}
