/** Ratified decisions each function implements (vault paths are relative to the main vault). */
export const SOURCES = {
  northStar: {
    path: 'vault/40_Patterns/memory-idea-riseup-north-star-metric-is-unprompted-o-01KZDJ8N.md',
    status: 'approved idea; page generated 2026-08-23',
  },
  shipRate14: {
    path: 'vault/40_Patterns/memory-idea-riseup-intake-metric-14-day-ship-rate-ab-01KZDJ8N.md',
    status: 'approved idea; page generated 2026-08-23; ~50% threshold not yet validated',
  },
  intakeCapacity: {
    path: 'vault/30_Decisions/decision-conflict-resolution-proposal-intake-capacity-about-2-people-.md',
    status: 'approved 2026-08-24',
  },
  activationBeats: {
    path: 'vault/30_Decisions/decision-conflict-resolution-proposal-activation-window-48-hours-vs-7.md',
    status: 'approved 2026-08-24 (page marked stale)',
  },
  probe1ExitGate: {
    path: 'vault/30_Decisions/decision-conflict-resolution-proposal-probe-1-exit-gate-runway-vs-can.md',
    status: 'approved 2026-08-24',
  },
  podPilotReadout: {
    path: 'vault/30_Decisions/decision-riseup-s-active-small-group-experiment-is-3-person-pods-defe.md',
    status: 'approved 2026-08-18',
  },
  fiveOutputsCoverage: {
    path: 'vault/40_Patterns/memory-reusable_pattern-riseup-produces-five-distinct-outputs-pa-01M09N2Z.md',
    status: 'reviewed pattern (generated synthesis, not yet approved); page generated 2026-09-03',
  },
  noStageMoves: {
    path: 'vault/30_Decisions/decision-conflict-resolution-proposal-mechanical-short-window-gates-v.md',
    status: 'approved 2026-08-24',
  },
  noShame: {
    path: 'vault/24_Constraints/memory-constraint-riseup-operational-visibility-must-revea-01KZD2FM.md',
    status: 'approved constraint; page generated 2026-08-23',
  },
} as const;
