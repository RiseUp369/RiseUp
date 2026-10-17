/**
 * Readiness gate for the Probe 3 absence. Verdicts:
 *  - NOT_READY       any blocking gap: coast mode itself is not pre-wired.
 *  - SHRINK_TO_COAST coast mode is pre-wired but formation is short (Branch C).
 *  - READY           no gaps.
 */
import type { AbsencePlan, EmergencyClass } from "./plan.ts";
import { daysBetween, isoToday } from "./plan.ts";
import { BRANCH_C_GUIDANCE, DOCTRINE_STATUS, EMERGENCY_CLASSES, RUNWAY_GATE, SOURCES } from "./doctrine.ts";
import { validatePlan } from "./schema.ts";

export type Verdict = "READY" | "SHRINK_TO_COAST" | "NOT_READY";
export type Severity = "blocking" | "shrink";
export type GapCode =
  | "NO_PRIMARY_HOLDER"
  | "NO_PRIMARY_BACKUP"
  | "SCOPE_NO_HOLDER"
  | "SCOPE_HELD_BY_FOUNDER"
  | "SCOPE_NO_BACKUP"
  | "SCOPE_NEEDS_FOUNDER"
  | "HOLDER_OVERLOAD"
  | "RESPONSE_WINDOW_NOT_FIXED"
  | "EMERGENCY_CLASS_UNROUTED"
  | "HEARTBEAT_INCOMPLETE"
  | "HANDOFF_NOT_WRITTEN"
  | "HANDOFF_RITUAL_NOT_DONE"
  | "NO_REHEARSAL"
  | "NO_ZERO_OPS_WEEK"
  | "NO_REUNION_DATE"
  | "REUNION_NOT_ANNOUNCED"
  | "REUNION_TOO_LATE"
  | "UNDER_PREPARED_NO_SECOND_OWNER"
  | "UNDER_PREPARED_VACUUM_L3";

export interface Gap {
  code: GapCode;
  severity: Severity;
  message: string;
  /** Doctrine paths that require this item. */
  sources: string[];
  scopeId?: string;
  /** Role label from the plan, when the gap concerns one role. */
  role?: string;
}

export interface CheckOptions {
  maxScopePerHolder?: number;
  /** YYYY-MM-DD; defaults to the system date. */
  today?: string;
}

export interface CheckResult {
  planId: string;
  verdict: Verdict;
  doctrineStatus: typeof DOCTRINE_STATUS;
  today: string;
  departureDate: string;
  daysToDeparture: number;
  maxScopePerHolder: number;
  holders: Array<{ role: string; scopeItems: number }>;
  gaps: Gap[];
  advice: string[];
  runwayGate: typeof RUNWAY_GATE;
}

export const DEFAULT_MAX_SCOPE_PER_HOLDER = 5;

export class PlanValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`invalid plan:\n  ${errors.join("\n  ")}`);
    this.errors = errors;
  }
}

export function checkPlan(plan: AbsencePlan, opts: CheckOptions = {}): CheckResult {
  const v = validatePlan(plan);
  if (!v.ok) throw new PlanValidationError(v.errors);

  const today = opts.today ?? isoToday();
  const founder = plan.absence.founderRole;
  const max = opts.maxScopePerHolder ?? plan.thresholds?.maxScopePerHolder ?? DEFAULT_MAX_SCOPE_PER_HOLDER;
  const gaps: Gap[] = [];
  const add = (g: Gap) => gaps.push(g);
  const unheld = (role: string) => role === "" || role === founder;

  // Named holder and backup for the whole absence (red-team guard 3).
  if (unheld(plan.absence.primaryHolder)) {
    add({ code: "NO_PRIMARY_HOLDER", severity: "blocking", sources: [SOURCES.redTeamGuard],
      message: "No holder role named for operational scope during the absence (the founder cannot hold it)." });
  }
  if (unheld(plan.absence.primaryBackup) || plan.absence.primaryBackup === plan.absence.primaryHolder) {
    add({ code: "NO_PRIMARY_BACKUP", severity: "blocking", sources: [SOURCES.branchA],
      message: "No distinct backup role for the primary holder (Branch A needs an interim anchor if the holder stalls)." });
  }

  // Scope items.
  for (const s of plan.scope) {
    if (s.holder === "") {
      add({ code: "SCOPE_NO_HOLDER", severity: "blocking", scopeId: s.id, sources: [SOURCES.redTeamGuard],
        message: `Scope "${s.title}" has no holder.` });
    } else if (s.holder === founder) {
      add({ code: "SCOPE_HELD_BY_FOUNDER", severity: "blocking", scopeId: s.id, role: founder, sources: [SOURCES.redTeamGuard, SOURCES.runway],
        message: `Scope "${s.title}" is held by the absent founder role.` });
    }
    if (s.backup === "" || s.backup === founder || s.backup === s.holder) {
      const why = s.backup === "" ? "has no backup" : s.backup === founder ? "has the absent founder as backup" : "has the holder as its own backup";
      add({ code: "SCOPE_NO_BACKUP", severity: "blocking", scopeId: s.id, sources: [SOURCES.branchA, SOURCES.redTeamGuard],
        message: `Scope "${s.title}" ${why}.` });
    }
    if (s.runsWithoutFounder === false) {
      add({ code: "SCOPE_NEEDS_FOUNDER", severity: "blocking", scopeId: s.id, sources: [SOURCES.runway],
        message: `Scope "${s.title}" is marked as not running without the founder.` });
    }
  }

  // Single point of failure.
  const counts = new Map<string, number>();
  for (const s of plan.scope) if (!unheld(s.holder)) counts.set(s.holder, (counts.get(s.holder) ?? 0) + 1);
  const holders = [...counts.entries()]
    .map(([role, scopeItems]) => ({ role, scopeItems }))
    .sort((a, b) => b.scopeItems - a.scopeItems || a.role.localeCompare(b.role));
  for (const h of holders) {
    if (h.scopeItems > max) {
      add({ code: "HOLDER_OVERLOAD", severity: "blocking", role: h.role, sources: [SOURCES.branchA, SOURCES.redTeamGuard],
        message: `"${h.role}" carries ${h.scopeItems} scope items (threshold ${max}): single point of failure.` });
    }
  }

  // Fixed weekly response window.
  if (plan.responseWindow.cadence !== "weekly" || plan.responseWindow.day === "unset") {
    add({ code: "RESPONSE_WINDOW_NOT_FIXED", severity: "blocking", sources: [SOURCES.emergencies],
      message: "The founder's response window is not fixed to one day a week." });
  }

  // Exactly three emergency interrupt classes, each routed to a non-founder first responder.
  for (const cls of Object.keys(EMERGENCY_CLASSES) as EmergencyClass[]) {
    const e = plan.emergencyInterrupts.find((x) => x.class === cls);
    if (!e || unheld(e.firstResponder)) {
      add({ code: "EMERGENCY_CLASS_UNROUTED", severity: "blocking", sources: [SOURCES.emergencies],
        message: `Emergency class ${cls} (${EMERGENCY_CLASSES[cls]}) has no non-founder first responder.` });
    }
  }

  // Coast heartbeat.
  const hb = plan.heartbeat;
  const heartbeat: Array<[boolean, string, string]> = [
    [hb.peerSession.cadence === "unset" || !hb.peerSession.rotatingHost, "peer session needs a fixed cadence and a rotating host", SOURCES.branchC],
    [unheld(hb.peerSession.holder), "peer session has no holder", SOURCES.branchC],
    [hb.asyncPulse.cadence === "unset" || unheld(hb.asyncPulse.holder), "async pulse needs a cadence and a non-founder holder", SOURCES.branchC],
    [hb.warmthLoop.messagesPlanned < 3 || unheld(hb.warmthLoop.holder), "warmth loop needs at least 3 planned no-agenda messages and a holder", SOURCES.branchD],
  ];
  for (const [bad, what, src] of heartbeat) {
    if (bad) add({ code: "HEARTBEAT_INCOMPLETE", severity: "blocking", sources: [src, SOURCES.twoModes], message: `Coast heartbeat: ${what}.` });
  }

  // Runway Phase 4 -> T-0 facts (same text in variants 023 and 024).
  if (!plan.runwayGate.coastPageWritten) {
    add({ code: "HANDOFF_NOT_WRITTEN", severity: "blocking", sources: [SOURCES.redTeamGuard, SOURCES.runway],
      message: "The written handoff (coast page) does not exist yet." });
  }
  if (!plan.runwayGate.handoffRitualDone) {
    add({ code: "HANDOFF_RITUAL_NOT_DONE", severity: "blocking", sources: [SOURCES.runway],
      message: "The public handoff ritual (authority transfer before departure) has not happened." });
  }
  if (!plan.rehearsals.some((r) => r.kind === "live-step-back")) {
    const tabletopOnly = plan.rehearsals.length > 0;
    add({ code: "NO_REHEARSAL", severity: "blocking", sources: [SOURCES.redTeamGuard, SOURCES.rehearsal],
      message: tabletopOnly
        ? "Only tabletop drills are logged; the guard needs one live step-back rehearsal."
        : "No live step-back rehearsal is logged." });
  }
  const z = plan.runwayGate.zeroOpsWeek;
  if (!z || z.founderInterventions > 0 || daysBetween(z.start, z.end) < 6) {
    const why = !z ? "none logged" : z.founderInterventions > 0 ? `${z.founderInterventions} founder intervention(s)` : "shorter than a full week";
    add({ code: "NO_ZERO_OPS_WEEK", severity: "blocking", sources: [SOURCES.runway],
      message: `No full week with zero founder interventions (${why}).` });
  }

  // Reunion date.
  if (!plan.reunion.date) {
    add({ code: "NO_REUNION_DATE", severity: "blocking", sources: [SOURCES.runway],
      message: "No reunion (full-group debrief) date is set." });
  } else {
    if (plan.reunion.announced !== true) {
      add({ code: "REUNION_NOT_ANNOUNCED", severity: "blocking", sources: [SOURCES.runway],
        message: "The reunion date is not announced before departure." });
    }
    const ret = plan.absence.returnDate;
    if (ret && daysBetween(ret, plan.reunion.date) > 14) {
      add({ code: "REUNION_TOO_LATE", severity: "blocking", sources: [SOURCES.runway],
        message: `Reunion ${plan.reunion.date} is more than 2 weeks after return ${ret}.` });
    }
  }

  // Branch C: entering the absence under-prepared.
  if (plan.formation.ownersBesidesFounder < 1) {
    add({ code: "UNDER_PREPARED_NO_SECOND_OWNER", severity: "shrink", sources: [SOURCES.branchC, SOURCES.runway],
      message: "No second Owner exists besides the founder." });
  }
  if (!plan.formation.coDriverVacuumLevel3Passed) {
    add({ code: "UNDER_PREPARED_VACUUM_L3", severity: "shrink", sources: [SOURCES.branchC, SOURCES.runway],
      message: "The co-driver has not passed Vacuum Level 3." });
  }

  const verdict: Verdict = gaps.some((g) => g.severity === "blocking")
    ? "NOT_READY"
    : gaps.length > 0 ? "SHRINK_TO_COAST" : "READY";

  const daysToDeparture = daysBetween(today, plan.absence.departureDate);
  const advice: string[] = [];
  if (verdict === "SHRINK_TO_COAST") {
    advice.push(BRANCH_C_GUIDANCE, `Source: ${SOURCES.branchC}`);
  } else if (verdict === "NOT_READY") {
    advice.push(
      `Close the blocking gaps before departure (${daysToDeparture} day(s) away). If departure arrives with them open, Branch C applies: ${BRANCH_C_GUIDANCE}`,
      `Source: ${SOURCES.branchC}`,
    );
  } else {
    advice.push("Coast mode is pre-wired. Keep the weekly response day and the three emergency classes as written.");
  }

  return {
    planId: plan.planId,
    verdict,
    doctrineStatus: DOCTRINE_STATUS,
    today,
    departureDate: plan.absence.departureDate,
    daysToDeparture,
    maxScopePerHolder: max,
    holders,
    gaps,
    advice,
    runwayGate: RUNWAY_GATE,
  };
}

export function formatCheck(r: CheckResult): string {
  const out: string[] = [];
  out.push(`Probe 3 readiness - plan ${r.planId} (doctrine ${r.doctrineStatus})`);
  out.push(`Verdict: ${r.verdict}`);
  out.push(`Departure ${r.departureDate} (${r.daysToDeparture} day(s) from ${r.today}); single-point-of-failure threshold ${r.maxScopePerHolder}`);
  out.push("");
  if (r.gaps.length === 0) out.push("Gaps: none");
  else {
    out.push(`Gaps (${r.gaps.length}):`);
    for (const g of r.gaps) {
      out.push(`  - [${g.severity.toUpperCase()}] ${g.code}: ${g.message}`);
      for (const s of g.sources) out.push(`      source: ${s}`);
    }
  }
  out.push("");
  out.push("Holder load (role labels):");
  for (const h of r.holders) out.push(`  - ${h.role}: ${h.scopeItems}`);
  out.push("");
  out.push(`Runway gate (${r.runwayGate.status}): ${r.runwayGate.gate}`);
  for (const v of r.runwayGate.variants) out.push(`  - ${v.id}: ${v.gateText} ${v.difference}`);
  out.push(`  ${r.runwayGate.note}`);
  out.push(`  source: ${r.runwayGate.source}`);
  out.push("");
  out.push("Advice:");
  for (const a of r.advice) out.push(`  ${a}`);
  return out.join("\n") + "\n";
}
