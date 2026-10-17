import { describe, expect, it } from "vitest";
import { validatePlan } from "../src/schema.ts";
import { fixture } from "./helpers.ts";

describe("absence-plan.schema.json validation", () => {
  it("accepts every synthetic fixture (gaps are not schema errors)", () => {
    for (const f of ["plan-ready.json", "plan-not-ready.json", "plan-under-prepared.json"]) {
      const r = validatePlan(fixture(f));
      expect(r.errors, f).toEqual([]);
      expect(r.ok).toBe(true);
    }
  });

  it("rejects a plan missing a required section", () => {
    const plan = fixture("plan-ready.json") as unknown as Record<string, unknown>;
    delete plan.reunion;
    const r = validatePlan(plan);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/reunion/);
  });

  it("rejects any field named name or email, at any depth", () => {
    const a = fixture("plan-ready.json") as unknown as { roles: Array<Record<string, unknown>> };
    a.roles[1].name = "Someone Real";
    expect(validatePlan(a).errors.join("\n")).toMatch(/forbidden field "name"/);
    const b = fixture("plan-ready.json") as unknown as { absence: Record<string, unknown> };
    b.absence.email = "x@example.org";
    expect(validatePlan(b).errors.join("\n")).toMatch(/forbidden field "email"/);
  });

  it("rejects holder values that are not role labels declared in roles", () => {
    const plan = fixture("plan-ready.json");
    plan.scope[0].holder = "Holder Z";
    const r = validatePlan(plan);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/unknown role label "Holder Z"/);
  });

  it("rejects contact-like role labels and malformed dates", () => {
    const plan = fixture("plan-ready.json");
    plan.roles.push({ label: "someone@example.org", kind: "holder" });
    plan.absence.departureDate = "02/11/2026";
    const msg = validatePlan(plan).errors.join("\n");
    expect(msg).toMatch(/roles\/5\/label/);
    expect(msg).toMatch(/departureDate/);
  });

  it("rejects doctrine marked as anything other than v0.1-unratified", () => {
    const plan = fixture("plan-ready.json") as unknown as Record<string, unknown>;
    plan.doctrineStatus = "ratified";
    expect(validatePlan(plan).ok).toBe(false);
  });
});
