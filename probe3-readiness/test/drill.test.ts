import { describe, expect, it } from "vitest";
import { buildDrill } from "../src/drill.ts";
import { SOURCES } from "../src/doctrine.ts";
import { fixture } from "./helpers.ts";

describe("drill (tabletop step-back script)", () => {
  const plan = fixture("plan-ready.json");
  const d = buildDrill(plan, { date: "2026-10-24" });

  it("has injects for all five branches A-E and the three emergency classes", () => {
    const ids = d.injects.map((i) => i.id);
    for (const id of ["branch-a", "branch-b", "branch-c", "branch-d", "branch-e", "harm_to_person", "reputational_damage", "money_legal"]) {
      expect(ids, id).toContain(id);
    }
    for (const id of ["A", "B", "C", "D", "E"]) expect(d.markdown).toContain(`Branch ${id}`);
    for (const s of [SOURCES.branchA, SOURCES.branchB, SOURCES.branchC, SOURCES.branchD, SOURCES.branchE, SOURCES.emergencies]) {
      expect(d.markdown).toContain(s);
    }
  });

  it("every inject carries a pre-committed response and a blank record line", () => {
    const blocks = d.markdown.split(/^### Inject /m).slice(1);
    expect(blocks.length).toBe(d.injects.length);
    for (const b of blocks) {
      expect(b).toMatch(/Pre-committed response/);
      expect(b).toMatch(/Holder acted without the founder\? \[ \] yes \[ \] no/);
      expect(b).toMatch(/What happened: _{10,}/);
    }
  });

  it("uses neutral paraphrase with no spiritual framing copied", () => {
    expect(d.markdown).not.toMatch(/karma|yoga|satsang|spiritual|divine|prayer|seva|swaminarayan|hindu/i);
  });

  it("routes each inject to a role label from the plan and labels doctrine v0.1/unratified", () => {
    const labels = new Set(plan.roles.map((r) => r.label));
    for (const i of d.injects) expect(labels.has(i.routedTo), `${i.id} -> ${i.routedTo}`).toBe(true);
    expect(d.markdown).toMatch(/v0\.1\/unratified/);
    expect(d.markdown).toMatch(/tabletop drill does not count as the live rehearsal/i);
  });

  it("includes curriculum (non-emergency) control injects that must not interrupt the founder", () => {
    const cur = d.injects.filter((i) => i.kind === "curriculum");
    expect(cur.length).toBeGreaterThanOrEqual(2);
    expect(d.markdown).toMatch(/What do you think we should do\?/);
  });
});
