import { describe, expect, it } from "vitest";
import { importStewards, parseStewardTable } from "../src/stewards.ts";
import { checkPlan } from "../src/check.ts";
import { validatePlan } from "../src/schema.ts";
import { fixture, fixtureText, TODAY } from "./helpers.ts";

const expected = [
  { rule: "Run the peer session", owner: "Holder A", backup: "Holder B", runsWithoutFounder: true },
  { rule: "Approve feedback posts, then publish", owner: "founder", backup: "", runsWithoutFounder: false },
  { rule: "Book the venue", owner: "", backup: "", runsWithoutFounder: null },
  { rule: "Send the async pulse", owner: "Holder B", backup: "Holder A", runsWithoutFounder: true },
];

describe("import-stewards", () => {
  it("parses the CSV steward sheet (rule|owner|backup|runs_without_founder), including quoted commas", () => {
    expect(parseStewardTable(fixtureText("stewards.csv"))).toEqual(expected);
  });

  it("parses the Markdown table form of the same sheet", () => {
    const rows = parseStewardTable(fixtureText("stewards.md"));
    expect(rows.map((r) => r.rule)).toEqual([
      "Run the peer session",
      "Approve feedback posts",
      "Book the venue",
      "Send the async pulse",
    ]);
    expect(rows[1]).toMatchObject({ owner: "founder", backup: "", runsWithoutFounder: false });
  });

  it("folds rows into scope items (rules are data, not hard-coded) and the result still validates", () => {
    const plan = fixture("plan-under-prepared.json");
    const merged = importStewards(plan, parseStewardTable(fixtureText("stewards.csv")));
    expect(validatePlan(merged).errors).toEqual([]);
    // Existing "Run the peer session" title is updated in place, not duplicated.
    expect(merged.scope.filter((s) => s.title === "Run the peer session")).toHaveLength(1);
    const venue = merged.scope.find((s) => s.title === "Book the venue");
    expect(venue).toMatchObject({ id: "rule-book-the-venue", holder: "", backup: "" });
    // "founder" maps to the plan's founder role label.
    const fb = merged.scope.find((s) => s.title.startsWith("Approve feedback"));
    expect(fb?.holder).toBe("Founder");
    const codes = checkPlan(merged, { today: TODAY }).gaps.map((g) => g.code);
    expect(codes).toContain("SCOPE_NO_HOLDER");
    expect(codes).toContain("SCOPE_HELD_BY_FOUNDER");
    expect(codes).toContain("SCOPE_NEEDS_FOUNDER");
  });

  it("adds unseen owner labels as role labels, never as names", () => {
    const plan = fixture("plan-under-prepared.json");
    const merged = importStewards(plan, [
      { rule: "Hold the archive", owner: "Steward E", backup: "Holder A", runsWithoutFounder: true },
    ]);
    expect(merged.roles).toContainEqual({ label: "Steward E", kind: "holder" });
    expect(JSON.stringify(merged)).not.toMatch(/"(name|email)"\s*:/);
  });

  it("refuses contact details in owner/backup cells", () => {
    const plan = fixture("plan-under-prepared.json");
    expect(() =>
      importStewards(plan, [{ rule: "x", owner: "someone@example.org", backup: "", runsWithoutFounder: null }]),
    ).toThrow(/role label/);
  });

  it("rejects a sheet missing a required column", () => {
    expect(() => parseStewardTable("rule,owner,backup\nA,B,C\n")).toThrow(/runs_without_founder/);
  });
});
