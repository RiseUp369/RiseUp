import { describe, expect, it } from "vitest";
import { checkPlan, formatCheck } from "../src/check.ts";
import { SOURCES } from "../src/doctrine.ts";
import { fixture, TODAY } from "./helpers.ts";

const codes = (plan: ReturnType<typeof fixture>, opts = {}) =>
  checkPlan(plan, { today: TODAY, ...opts }).gaps.map((g) => g.code);

describe("check verdicts", () => {
  it("READY: the ready fixture has no gaps", () => {
    const r = checkPlan(fixture("plan-ready.json"), { today: TODAY });
    expect(r.gaps).toEqual([]);
    expect(r.verdict).toBe("READY");
  });

  it("NOT_READY: the not-ready fixture lists every gap type", () => {
    const r = checkPlan(fixture("plan-not-ready.json"), { today: TODAY });
    expect(r.verdict).toBe("NOT_READY");
    const set = new Set(r.gaps.map((g) => g.code));
    for (const c of [
      "NO_PRIMARY_HOLDER",
      "NO_PRIMARY_BACKUP",
      "SCOPE_NO_HOLDER",
      "SCOPE_HELD_BY_FOUNDER",
      "SCOPE_NO_BACKUP",
      "SCOPE_NEEDS_FOUNDER",
      "HOLDER_OVERLOAD",
      "RESPONSE_WINDOW_NOT_FIXED",
      "EMERGENCY_CLASS_UNROUTED",
      "HEARTBEAT_INCOMPLETE",
      "HANDOFF_NOT_WRITTEN",
      "HANDOFF_RITUAL_NOT_DONE",
      "NO_REHEARSAL",
      "NO_ZERO_OPS_WEEK",
      "NO_REUNION_DATE",
      "UNDER_PREPARED_NO_SECOND_OWNER",
      "UNDER_PREPARED_VACUUM_L3",
    ]) {
      expect(set.has(c as never), c).toBe(true);
    }
  });

  it("every gap carries at least one known doctrine source path", () => {
    const known = new Set(Object.values(SOURCES));
    const r = checkPlan(fixture("plan-not-ready.json"), { today: TODAY });
    for (const g of r.gaps) {
      expect(g.sources.length, g.code).toBeGreaterThan(0);
      for (const s of g.sources) expect(known.has(s), `${g.code} -> ${s}`).toBe(true);
    }
    const text = formatCheck(r);
    for (const g of r.gaps) expect(text).toContain(g.code);
    expect(text).toContain(SOURCES.runway);
  });

  it("SHRINK_TO_COAST: under-prepared fixture points at Branch C maintenance-season guidance", () => {
    const r = checkPlan(fixture("plan-under-prepared.json"), { today: TODAY });
    expect(r.verdict).toBe("SHRINK_TO_COAST");
    expect(r.gaps.every((g) => g.severity === "shrink")).toBe(true);
    expect(r.gaps.flatMap((g) => g.sources)).toContain(SOURCES.branchC);
    expect(r.advice.join("\n")).toMatch(/maintenance season/i);
    expect(r.advice.join("\n")).toContain(SOURCES.branchC);
  });

  it("SHRINK_TO_COAST: Vacuum Level 3 not passed alone is enough", () => {
    const plan = fixture("plan-ready.json");
    plan.formation.coDriverVacuumLevel3Passed = false;
    const r = checkPlan(plan, { today: TODAY });
    expect(r.verdict).toBe("SHRINK_TO_COAST");
    expect(r.gaps.map((g) => g.code)).toEqual(["UNDER_PREPARED_VACUUM_L3"]);
  });

  it("blocking gaps outrank shrink gaps (cannot even run coast mode)", () => {
    const plan = fixture("plan-under-prepared.json");
    plan.rehearsals = [];
    expect(checkPlan(plan, { today: TODAY }).verdict).toBe("NOT_READY");
  });
});

describe("individual gap types", () => {
  it("scope with no holder, and scope held by the absent founder", () => {
    const plan = fixture("plan-ready.json");
    plan.scope[0].holder = "";
    plan.scope[1].holder = "Founder";
    const c = codes(plan);
    expect(c).toContain("SCOPE_NO_HOLDER");
    expect(c).toContain("SCOPE_HELD_BY_FOUNDER");
  });

  it("scope with no backup: empty, same as holder, or the founder", () => {
    for (const backup of ["", "Holder A", "Founder"]) {
      const plan = fixture("plan-ready.json");
      plan.scope[0].backup = backup; // holder is Holder A
      expect(codes(plan), backup || "(empty)").toContain("SCOPE_NO_BACKUP");
    }
  });

  it("single point of failure: exactly N items is fine, N+1 is flagged; --max-per-holder overrides", () => {
    const plan = fixture("plan-ready.json"); // threshold 3, Holder A holds 2
    plan.scope[2].holder = "Holder A"; // now 3
    expect(codes(plan)).not.toContain("HOLDER_OVERLOAD");
    plan.scope[3].holder = "Holder A"; // now 4
    plan.scope[3].backup = "Holder B";
    const r = checkPlan(plan, { today: TODAY });
    const g = r.gaps.find((x) => x.code === "HOLDER_OVERLOAD");
    expect(g?.role).toBe("Holder A");
    expect(g?.message).toMatch(/4 scope items/);
    expect(codes(plan, { maxScopePerHolder: 4 })).not.toContain("HOLDER_OVERLOAD");
  });

  it("default single-point-of-failure threshold is 5 when the plan sets none", () => {
    const plan = fixture("plan-ready.json");
    delete plan.thresholds;
    for (const s of plan.scope) { s.holder = "Holder B"; s.backup = "Holder C"; }
    expect(checkPlan(plan, { today: TODAY }).maxScopePerHolder).toBe(5);
    expect(codes(plan)).toContain("HOLDER_OVERLOAD"); // 6 > 5
  });

  it("handoff not written and handoff ritual not done", () => {
    const plan = fixture("plan-ready.json");
    plan.runwayGate.coastPageWritten = false;
    plan.runwayGate.handoffRitualDone = false;
    expect(codes(plan)).toEqual(["HANDOFF_NOT_WRITTEN", "HANDOFF_RITUAL_NOT_DONE"]);
  });

  it("no rehearsal: a tabletop drill alone does not satisfy the live-rehearsal guard", () => {
    const plan = fixture("plan-ready.json");
    plan.rehearsals = [{ date: "2026-10-01", kind: "tabletop", holderActedWithoutFounder: true }];
    const r = checkPlan(plan, { today: TODAY });
    expect(r.gaps.map((g) => g.code)).toEqual(["NO_REHEARSAL"]);
    expect(r.gaps[0].sources).toContain(SOURCES.redTeamGuard);
  });

  it("no zero-ops week: missing, too short, or with a founder intervention", () => {
    const a = fixture("plan-ready.json");
    a.runwayGate.zeroOpsWeek = null;
    expect(codes(a)).toEqual(["NO_ZERO_OPS_WEEK"]);
    const b = fixture("plan-ready.json");
    b.runwayGate.zeroOpsWeek = { start: "2026-10-05", end: "2026-10-09", founderInterventions: 0 };
    expect(codes(b)).toEqual(["NO_ZERO_OPS_WEEK"]);
    const c = fixture("plan-ready.json");
    c.runwayGate.zeroOpsWeek = { start: "2026-10-05", end: "2026-10-11", founderInterventions: 1 };
    expect(codes(c)).toEqual(["NO_ZERO_OPS_WEEK"]);
  });

  it("no reunion date, unannounced reunion, and reunion later than 2 weeks after return", () => {
    const a = fixture("plan-ready.json");
    a.reunion = { date: null, announced: false };
    expect(codes(a)).toEqual(["NO_REUNION_DATE"]);
    const b = fixture("plan-ready.json");
    b.reunion.announced = false;
    expect(codes(b)).toEqual(["REUNION_NOT_ANNOUNCED"]);
    const c = fixture("plan-ready.json");
    c.reunion.date = "2027-04-30";
    expect(codes(c)).toEqual(["REUNION_TOO_LATE"]);
  });

  it("response window not fixed to one weekly day", () => {
    const plan = fixture("plan-ready.json");
    plan.responseWindow.day = "unset";
    expect(codes(plan)).toEqual(["RESPONSE_WINDOW_NOT_FIXED"]);
  });

  it("each of the three emergency classes must route to a non-founder first responder", () => {
    const plan = fixture("plan-ready.json");
    plan.emergencyInterrupts = plan.emergencyInterrupts.filter((e) => e.class !== "money_legal");
    plan.emergencyInterrupts[0].firstResponder = "Founder";
    const gaps = checkPlan(plan, { today: TODAY }).gaps.filter((g) => g.code === "EMERGENCY_CLASS_UNROUTED");
    expect(gaps.map((g) => g.message).join("\n")).toMatch(/money_legal/);
    expect(gaps.map((g) => g.message).join("\n")).toMatch(/harm_to_person/);
  });

  it("shows both Runway variants 023 and 024 as unreconciled without picking one", () => {
    const r = checkPlan(fixture("plan-ready.json"), { today: TODAY });
    expect(r.runwayGate.status).toBe("unreconciled");
    expect(r.runwayGate.variants.map((v) => v.id)).toEqual(["attachment-023", "attachment-024"]);
    expect(r.doctrineStatus).toBe("v0.1/unratified");
    expect(formatCheck(r)).toMatch(/023[\s\S]*024[\s\S]*unreconciled/i);
  });
});
