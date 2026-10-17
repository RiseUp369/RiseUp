import { describe, expect, it } from "vitest";
import { renderHandoff } from "../src/handoff.ts";
import { fixture, TODAY } from "./helpers.ts";

describe("handoff one-pager", () => {
  it("renders Markdown with scope table, response day, emergencies, heartbeat, reunion and both Runway variants", () => {
    const md = renderHandoff(fixture("plan-ready.json"), "md", { today: TODAY });
    expect(md).toMatch(/^# Probe 3 handoff/m);
    expect(md).toMatch(/v0\.1\/unratified/);
    expect(md).toContain("| Run the peer session | Holder A | Holder B |");
    expect(md).toMatch(/saturday/i);
    expect(md).toMatch(/harm to a person/i);
    expect(md).toMatch(/reputational damage/i);
    expect(md).toMatch(/money or legal/i);
    expect(md).toContain("2027-03-06");
    expect(md).toMatch(/attachment-023/);
    expect(md).toMatch(/attachment-024/);
    expect(md).toMatch(/unreconciled/i);
    expect(md).toMatch(/Readiness: READY/);
    expect(md.split("\n").length).toBeLessThan(90); // one printable page
  });

  it("renders a self-contained printable HTML page and escapes plan text", () => {
    const plan = fixture("plan-ready.json");
    plan.scope[0].title = "Run <the> peer session & more";
    const html = renderHandoff(plan, "html", { today: TODAY });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Run &lt;the&gt; peer session &amp; more");
    expect(html).not.toContain("<the>");
    expect(html).toMatch(/@media print/);
    expect(html).not.toMatch(/<script|https?:\/\//i); // no scripts, no network
  });
});
