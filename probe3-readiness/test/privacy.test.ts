import { describe, expect, it } from "vitest";
import { checkPlan } from "../src/check.ts";
import { buildDrill } from "../src/drill.ts";
import { renderHandoff } from "../src/handoff.ts";
import { importStewards, parseStewardTable } from "../src/stewards.ts";
import { fixture, fixtureText, TODAY } from "./helpers.ts";

function keysDeep(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) { out.push(k); keysDeep(x, out); }
  }
  return out;
}

describe("privacy guard", () => {
  it("no output contains a field named name or email", () => {
    for (const f of ["plan-ready.json", "plan-not-ready.json", "plan-under-prepared.json"]) {
      const plan = fixture(f);
      const outputs: unknown[] = [
        checkPlan(plan, { today: TODAY }),
        buildDrill(plan, { date: TODAY }).injects,
        importStewards(plan, parseStewardTable(fixtureText("stewards.csv"))),
      ];
      for (const o of outputs) {
        const keys = keysDeep(o).map((k) => k.toLowerCase());
        expect(keys).not.toContain("name");
        expect(keys).not.toContain("email");
      }
      for (const fmt of ["md", "html"] as const) {
        // Strip markup first: the HTML <meta name="viewport"> attribute is not a data field.
        const text = renderHandoff(plan, fmt, { today: TODAY }).replace(/<[^>]*>/g, " ");
        expect(text).not.toMatch(/\b(name|email)\s*[:=]/i);
      }
    }
  });

  it("every holder value surfaced by check is a role label declared in the plan", () => {
    for (const f of ["plan-ready.json", "plan-not-ready.json", "plan-under-prepared.json"]) {
      const plan = fixture(f);
      const labels = new Set(plan.roles.map((r) => r.label));
      const r = checkPlan(plan, { today: TODAY });
      for (const h of r.holders) expect(labels.has(h.role), `${f}: ${h.role}`).toBe(true);
      for (const g of r.gaps) if (g.role) expect(labels.has(g.role), `${f}: ${g.role}`).toBe(true);
    }
  });
});
