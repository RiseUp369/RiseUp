/** handoff: a printable one-page sheet (Markdown or self-contained HTML) rendered from the plan. */
import type { AbsencePlan, EmergencyClass } from "./plan.ts";
import { DOCTRINE_STATUS, EMERGENCY_CLASSES, RUNWAY_GATE } from "./doctrine.ts";
import { checkPlan } from "./check.ts";

export type HandoffFormat = "md" | "html";

interface Section { heading: string; lines?: string[]; table?: { head: string[]; rows: string[][] } }

function sections(plan: AbsencePlan, today?: string): { title: string; sub: string; body: Section[] } {
  const r = checkPlan(plan, { today });
  const a = plan.absence;
  const hb = plan.heartbeat;
  const resp = (cls: EmergencyClass) => plan.emergencyInterrupts.find((e) => e.class === cls)?.firstResponder || "(unrouted)";
  const rehearsal = plan.rehearsals.filter((x) => x.kind === "live-step-back").map((x) => x.date);
  return {
    title: `${a.probe} handoff - ${plan.planId}`,
    sub: `Doctrine ${DOCTRINE_STATUS}. Role labels only. Readiness: ${r.verdict} (${r.gaps.length} gap(s) on ${r.today}).`,
    body: [
      {
        heading: "Absence",
        lines: [
          `Departure ${a.departureDate}; return ${a.returnDate ?? "(not set)"}; reunion ${plan.reunion.date ?? "(not set)"}${plan.reunion.announced ? " (announced)" : ""}.`,
          `Primary holder: ${a.primaryHolder || "(none)"}; backup: ${a.primaryBackup || "(none)"}.`,
          `The founder answers once a week, on ${plan.responseWindow.day}. Anything else waits for that day.`,
        ],
      },
      {
        heading: "Interrupt the founder only for",
        lines: (Object.keys(EMERGENCY_CLASSES) as EmergencyClass[]).map(
          (c) => `${EMERGENCY_CLASSES[c][0].toUpperCase()}${EMERGENCY_CLASSES[c].slice(1)} - first responder ${resp(c)}.`,
        ).concat(["Everything else is curriculum: ask 'What do you think we should do?' and back the answer."]),
      },
      {
        heading: "Scope",
        table: {
          head: ["Scope", "Holder", "Backup", "Runs without founder"],
          rows: plan.scope.map((s) => [s.title, s.holder || "(none)", s.backup || "(none)",
            s.runsWithoutFounder === true ? "yes" : s.runsWithoutFounder === false ? "no" : "?"]),
        },
      },
      {
        heading: "Coast heartbeat",
        lines: [
          `Peer session: ${hb.peerSession.cadence}${hb.peerSession.rotatingHost ? ", rotating host" : ""}; holder ${hb.peerSession.holder || "(none)"}.`,
          `Async pulse: ${hb.asyncPulse.cadence}; holder ${hb.asyncPulse.holder || "(none)"}.`,
          `Warmth loop: ${hb.warmthLoop.messagesPlanned} no-agenda messages across the absence; holder ${hb.warmthLoop.holder || "(none)"}.`,
        ],
      },
      {
        heading: "Runway Phase 4 -> T-0 gate (unreconciled variants)",
        lines: [
          `Coast page written: ${plan.runwayGate.coastPageWritten ? "yes" : "no"}. Handoff ritual done: ${plan.runwayGate.handoffRitualDone ? "yes" : "no"}. Zero-ops week: ${plan.runwayGate.zeroOpsWeek ? `${plan.runwayGate.zeroOpsWeek.start} to ${plan.runwayGate.zeroOpsWeek.end}, ${plan.runwayGate.zeroOpsWeek.founderInterventions} intervention(s)` : "none"}. Live rehearsal: ${rehearsal.join(", ") || "none"}.`,
          ...RUNWAY_GATE.variants.map((v) => `${v.id}: ${v.gateText} ${v.difference}`),
          RUNWAY_GATE.note,
        ],
      },
    ],
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function mdCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function renderHandoff(plan: AbsencePlan, format: HandoffFormat, opts: { today?: string } = {}): string {
  const doc = sections(plan, opts.today);
  if (format === "md") {
    const L = [`# ${doc.title}`, "", `_${doc.sub}_`, ""];
    for (const s of doc.body) {
      L.push(`## ${s.heading}`, "");
      for (const l of s.lines ?? []) L.push(`- ${l}`);
      if (s.table) {
        L.push(`| ${s.table.head.join(" | ")} |`, `| ${s.table.head.map(() => "---").join(" | ")} |`);
        for (const row of s.table.rows) L.push(`| ${row.map(mdCell).join(" | ")} |`);
      }
      L.push("");
    }
    return L.join("\n");
  }
  const parts: string[] = [];
  for (const s of doc.body) {
    parts.push(`<h2>${esc(s.heading)}</h2>`);
    if (s.lines) parts.push(`<ul>${s.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`);
    if (s.table) {
      parts.push(
        `<table><thead><tr>${s.table.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>` +
          s.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") +
          `</tbody></table>`,
      );
    }
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)}</title>
<style>
:root{--ink:#1b1b1b;--muted:#555;--rule:#ccc;--bg:#fff}
@media (prefers-color-scheme: dark){:root{--ink:#eee;--muted:#aaa;--rule:#444;--bg:#151515}}
body{font:13px/1.4 system-ui,sans-serif;color:var(--ink);background:var(--bg);max-width:780px;margin:16px auto;padding:0 16px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:14px 0 4px;border-bottom:1px solid var(--rule)}
p.sub{color:var(--muted);margin:0 0 8px}ul{margin:4px 0;padding-left:18px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid var(--rule);padding:3px 6px;text-align:left;vertical-align:top}
@media print{:root{--ink:#000;--muted:#333;--rule:#999;--bg:#fff}body{margin:0;max-width:none;font-size:11px}@page{size:A4;margin:12mm}}
</style></head>
<body><h1>${esc(doc.title)}</h1><p class="sub">${esc(doc.sub)}</p>
${parts.join("\n")}
</body></html>
`;
}
