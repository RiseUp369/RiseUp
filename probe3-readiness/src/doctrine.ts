/**
 * Doctrine the kit encodes. All of it is v0.1 and UNRATIFIED. Text here is a
 * neutral paraphrase of the sources; nothing is copied verbatim and no
 * spiritual framing is carried over. Paths are relative to the owner's
 * OpenBrain checkout (`vault/` = jpopenbrain/vault).
 */
import type { EmergencyClass } from "./plan.ts";

export const DOCTRINE_STATUS = "v0.1/unratified" as const;

const BRAIN = "jpopenbrain/docs/riseup-brain/attic-vault-r1b/RiseUp_Brain";

export const SOURCES = {
  redTeamGuard: "vault/30_Decisions/decision-conflict-resolution-proposal-the-five-red-team-critiques-bec.md",
  twoModes: "vault/30_Decisions/decision-riseup-two-operating-modes-growth-and-coast-the-historical-t.md",
  rehearsal: "vault/40_Patterns/memory-reusable_pattern-riseup-absence-protocol-should-be-rehear-01KZJ9TA.md",
  runway: "vault/40_Patterns/memory-reusable_pattern-runway-v0-1-consolidated-design-card-a-f-01KZP40N.md",
  probe3: "vault/22_Features/feature-probe-3-01KZDJ8M.md",
  emergencies: `${BRAIN}/Absence Contingency Tree defines exactly 3 emergency interrupts and a fixed once.md`,
  branchA: `${BRAIN}/Contingency Branch A_ co-driver stalls — first move is Keep not Forge, dormancy.md`,
  branchB: `${BRAIN}/Contingency Branch B_ activity without initiative is a finding, not a failure —.md`,
  branchC: `${BRAIN}/Contingency Branch C_ entering absence under-prepared — shrink scope, run coast.md`,
  branchD: `${BRAIN}/Contingency Branch D_ total collapse mid-absence — do nothing operational, prese.md`,
  branchE: `${BRAIN}/Contingency Branch E_ founder pulled back in — redirect escalations, weekly self.md`,
} as const;

export const EMERGENCY_CLASSES: Record<EmergencyClass, string> = {
  harm_to_person: "harm to a person",
  reputational_damage: "reputational damage to the community",
  money_legal: "money or legal exposure",
};

export const BRANCH_C_GUIDANCE =
  "Branch C (v0.1/unratified): do not fake readiness. Shrink to coast mode only - pause the second circle, " +
  "keep a peer session every two weeks with a rotating host and a monthly async pulse - and announce the " +
  "smaller scope before leaving as a maintenance season, so nobody reads it as decay. The absence still " +
  "tests whether anything persists unattended.";

/** Runway v0.1 Phase 4 -> T-0 gate. Both archived variants are shown; the kit does not pick one. */
export const RUNWAY_GATE = {
  status: "unreconciled" as const,
  gate: "Phase 4 -> T-0: coast page written, handoff ritual done, and the co-driver holds all operational scope for at least one full week with zero founder interventions.",
  variants: [
    {
      id: "attachment-023",
      label: "Runway v0.1 variant 023 (richer)",
      gateText: "Same Phase 4 -> T-0 gate.",
      difference: "Adds a mandatory First-14-Days intake routing step for every warm-list yes before sprint entry.",
    },
    {
      id: "attachment-024",
      label: "Runway v0.1 variant 024 (shorter)",
      gateText: "Same Phase 4 -> T-0 gate.",
      difference: "Lacks the intake routing sentence; warm-list outreach invites people to the sprint directly.",
    },
  ],
  note: "Unreconciled: no supersession or approval record decides between 023 and 024. Human review decides. This kit shows both and picks neither.",
  source: SOURCES.runway,
};
