/**
 * drill: a tabletop step-back script. Injects come from Contingency Branches
 * A-E, the three emergency interrupt classes, and two "curriculum" controls
 * that must NOT interrupt the founder. Responses are neutral paraphrases of
 * v0.1/unratified doctrine.
 */
import type { AbsencePlan, EmergencyClass } from "./plan.ts";
import { isoToday } from "./plan.ts";
import { DOCTRINE_STATUS, EMERGENCY_CLASSES, SOURCES } from "./doctrine.ts";

export interface Inject {
  id: string;
  kind: "branch" | "emergency" | "curriculum";
  title: string;
  routedTo: string;
  scenario: string;
  response: string;
  notAllowed: string;
  source: string;
}

const RECORD = "Holder acted without the founder? [ ] yes [ ] no";
const BLANK = "What happened: ______________________________________________";

function pick(plan: AbsencePlan, ...candidates: string[]): string {
  const f = plan.absence.founderRole;
  return candidates.find((c) => c && c !== f) ?? f;
}

export function buildInjects(plan: AbsencePlan): Inject[] {
  const holder = pick(plan, plan.absence.primaryHolder, plan.absence.primaryBackup);
  const backup = pick(plan, plan.absence.primaryBackup, plan.absence.primaryHolder);
  const warmth = pick(plan, plan.heartbeat.warmthLoop.holder, holder);
  const first = (cls: EmergencyClass) =>
    pick(plan, plan.emergencyInterrupts.find((e) => e.class === cls)?.firstResponder ?? "", holder);

  const injects: Inject[] = [
    {
      id: "branch-a", kind: "branch", title: "Branch A - the primary holder stalls", routedTo: backup,
      scenario: `${holder} has missed two commitments in a row and has been quiet for two weeks.`,
      response: "Start with one personal conversation about how they are doing, not about tasks. If it is a life event or burnout, offer an honourable pause and let the most initiative-positive member act as interim anchor with reduced scope. If the drive is simply not there, accept that as data and lower the absence goal to 'the community stays warm'.",
      notAllowed: "The founder running the organisation remotely.",
      source: SOURCES.branchA,
    },
    {
      id: "branch-b", kind: "branch", title: "Branch B - activity without initiative", routedTo: holder,
      scenario: `Sessions only happen when ${holder} pushes, and nobody new has crossed the Contributor gate.`,
      response: "Treat it as a finding, not a failure: the dependency moved instead of dissolving. Let it run, and log a return-phase priority: the holder learns to open gaps for others rather than fill them.",
      notAllowed: "Concluding from one cycle that the community lacks drive.",
      source: SOURCES.branchB,
    },
    {
      id: "branch-c", kind: "branch", title: "Branch C - departure day arrives under-prepared", routedTo: holder,
      scenario: "Departure day arrives with no second Owner, or the co-driver has not passed Vacuum Level 3.",
      response: "Do not fake readiness. Shrink to coast mode only: pause the second circle, keep a peer session every two weeks with a rotating host and a monthly async pulse. Announce the smaller scope before leaving as a maintenance season so nobody reads it as decay.",
      notAllowed: "Starting the absence at full scope and hoping it holds.",
      source: SOURCES.branchC,
    },
    {
      id: "branch-d", kind: "branch", title: "Branch D - coast mode itself stops", routedTo: warmth,
      scenario: "Mid-absence, no peer session has run for a month and the async pulse goes unanswered.",
      response: "Do nothing operational. A collapse during a designed test is the reading working. Keep only the warmth loop: three or four personal, no-agenda messages to key people across the absence. The rebuild after return starts from relationships, playbooks and data.",
      notAllowed: "Restarting programs from abroad.",
      source: SOURCES.branchD,
    },
    {
      id: "branch-e", kind: "branch", title: "Branch E - the founder is pulled back in", routedTo: holder,
      scenario: "The founder notices they are checking group chats daily and drafting fixes.",
      response: `Redirect every escalation to ${holder}, visibly. Weekly self-check: did anyone's judgment grow this week because the founder stayed out? If there is no example, the founder is probably steering invisibly. Being needed is the habit the design is meant to retire.`,
      notAllowed: "Quietly resuming decisions from a distance.",
      source: SOURCES.branchE,
    },
  ];

  const scenarios: Record<EmergencyClass, string> = {
    harm_to_person: "A member reports that someone was hurt, or is at risk, at a session.",
    reputational_damage: "A public post misrepresents the community and is being shared widely.",
    money_legal: "A notice arrives that would commit community money or carries legal exposure.",
  };
  for (const cls of Object.keys(EMERGENCY_CLASSES) as EmergencyClass[]) {
    injects.push({
      id: cls, kind: "emergency", title: `Emergency - ${EMERGENCY_CLASSES[cls]}`, routedTo: first(cls),
      scenario: scenarios[cls],
      response: "This is one of exactly three classes that justify contacting the founder outside the weekly window. The first-responder role handles the immediate situation locally first, then contacts the founder with what happened and what was done.",
      notAllowed: "Waiting for the weekly window, or treating a non-emergency as this class.",
      source: SOURCES.emergencies,
    });
  }

  for (const [id, scenario] of [
    ["curriculum-flop", "A session flopped: low turnout and the activity did not land."],
    ["curriculum-silence", "Nobody is responding in the group chat this week."],
  ] as const) {
    injects.push({
      id, kind: "curriculum", title: "Control - not an emergency", routedTo: holder, scenario,
      response: "Not an emergency: this is curriculum. Answer any ping with 'What do you think we should do?' and endorse the answer unless it is catastrophic. It waits for the weekly window.",
      notAllowed: "Interrupting the founder outside the weekly window.",
      source: SOURCES.emergencies,
    });
  }
  return injects;
}

export function buildDrill(plan: AbsencePlan, opts: { date?: string } = {}): { markdown: string; injects: Inject[] } {
  const date = opts.date ?? isoToday();
  const injects = buildInjects(plan);
  const L: string[] = [];
  L.push(`# Step-back drill - ${plan.absence.probe} (${plan.planId})`);
  L.push("");
  L.push(`Date: ${date} · Doctrine: ${DOCTRINE_STATUS} · Weekly response day: ${plan.responseWindow.day}`);
  L.push("");
  L.push("> All responses below are v0.1/unratified pre-commitments, paraphrased neutrally. Role labels only; no names.");
  L.push("> A tabletop drill does not count as the live rehearsal the red-team guard requires. Log it as `tabletop`; run a live step-back separately.");
  L.push("");
  L.push("## How to run it");
  L.push("");
  L.push("1. The founder stays silent for the whole drill. A facilitator reads each inject aloud.");
  L.push("2. The routed role says what they would do, before anyone reads the pre-committed response.");
  L.push("3. Compare, then tick whether the holder acted without the founder and note what happened.");
  L.push("");
  injects.forEach((i, n) => {
    L.push(`### Inject ${n + 1} - ${i.title}`);
    L.push("");
    L.push(`- Routed to: ${i.routedTo}`);
    L.push(`- Scenario (synthetic): ${i.scenario}`);
    L.push(`- Pre-committed response (${DOCTRINE_STATUS}): ${i.response}`);
    L.push(`- Not allowed: ${i.notAllowed}`);
    L.push(`- Source: \`${i.source}\``);
    L.push(`- ${RECORD}`);
    L.push(`- ${BLANK}`);
    L.push("");
  });
  L.push("## Log entry");
  L.push("");
  L.push("Add this to `rehearsals` in the plan's *.local.json after the drill:");
  L.push("");
  L.push("```json");
  L.push(JSON.stringify({ date, kind: "tabletop", holderActedWithoutFounder: false, notes: "" }, null, 2));
  L.push("```");
  return { markdown: L.join("\n") + "\n", injects };
}
