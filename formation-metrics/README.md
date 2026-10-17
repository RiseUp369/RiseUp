# formation-metrics

A reference library and a small CLI that compute RiseUp's ratified formation metrics and gate calculators from an `events.jsonl` log. All functions are pure and return aggregates only. Nothing here reads a database, calls a network or writes outside this folder.

## Why

The doctrine relies on ratified numbers that nothing computes today. These are unprompted ownership per opened slot, the 14-day ship rate, intake capacity, the activation beats, the Probe 1 exit gate, and the pod-pilot evidence that has to exist before the Circle model is considered. The only counts that exist today are rescue, gap and stepped-in. The "measurement" store in the stitch contract was named but not built. This library gives that store a tested reference that the cockpit or the Capability OS lane can adopt later without a schema change. Evidence is in the table below. The open thread is "Instrument the five organisational outputs plus north-star and intake metrics".

## Run

```sh
cd formation-metrics
npm install            # dev dependencies only: vitest 3.2.4, typescript 5.9.3, @types/node 22.18.0
npm test               # 51 vitest cases
npm run type-check     # tsc --noEmit
node src/cli.ts report fixtures/events.synthetic.jsonl --quarter 2026Q4 [--as-of 2026-12-11] [--config my.config.json]
```

This needs Node 22.18 or later, which runs `.ts` files directly through type stripping. There are no runtime dependencies. `--as-of` defaults to the date of the latest event, so the output is deterministic. `--config` takes a partial `FormationConfig` as JSON, for example `{"stageLabels": ["Prospect", "Trial", "Contributor", "Owner", "Driver", "Cultivator"]}`.

## Function to ratified decision

Vault paths are relative to the main vault. For the conflict-resolution decisions, the approval date is the "Status is now approved" entry in the page's evidence trail. Pages without a trail show their generation date.

| Function | What it returns | Ratified source | Status / date |
| --- | --- | --- | --- |
| `northStar(events, quarter)` | `ownershipEvents`, `slotsOpened`, `ratio` (`undefined` when no slot was opened), `distinctOwners` (a count), `gapsObserved`, and the note that silence after an unopened gap is no evidence | `vault/40_Patterns/memory-idea-riseup-north-star-metric-is-unprompted-o-01KZDJ8N.md` | approved idea, page 2026-08-23 |
| `shipRate14(entrants, asOf)` | `rate`, `shipped`, `denominator` (entrants with a Day-0 conversation whose window has closed), `pending`, `belowThreshold` at 0.5 labelled `threshold not yet validated` | `vault/40_Patterns/memory-idea-riseup-intake-metric-14-day-ship-rate-ab-01KZDJ8N.md` | approved idea, page 2026-08-23 |
| `intakeCapacity({activeWelcomers, availableHours, hoursPerEntrant})` | `min(welcomers x 3, floor(hours / hoursPerEntrant))` and `bindingConstraint` (`welcomers`, `hours` or `tie`) | `vault/30_Decisions/decision-conflict-resolution-proposal-intake-capacity-about-2-people-.md` | approved 2026-08-24 |
| `activationBeats(day0, asOf, completed?)` | Four beats with `due` and `overdue`: named human plus thank-you (48h, so day 2), real task (day 3), feedback (day 10), social tie (day 14). Day 0 counts as day 1, matching the shipped `INTAKE_ITEMS`. | `vault/30_Decisions/decision-conflict-resolution-proposal-activation-window-48-hours-vs-7.md` | approved 2026-08-24 (page marked stale) |
| `probe1ExitGate({deliverableShipped, unpromptedMovesByNonCoDriver, decisionLogEntries})` | Pass or fail per criterion and overall: shipped at any quality, at least 1 unprompted move by someone other than the co-driver, and at least 10 decision-log entries as an evidence floor | `vault/30_Decisions/decision-conflict-resolution-proposal-probe-1-exit-gate-runway-vs-can.md` | approved 2026-08-24 |
| `podPilotReadout(sessions, {qualitativeEvidence?})` | Aggregate attendance, continuation without founder rescue and facilitator hours per session, plus which of the six Circle-deferral evidence dimensions have data | `vault/30_Decisions/decision-riseup-s-active-small-group-experiment-is-3-person-pods-defe.md` | approved 2026-08-18 |
| `fiveOutputsCoverage(events)` | Event count for each of the five outputs, and `noData` | `vault/40_Patterns/memory-reusable_pattern-riseup-produces-five-distinct-outputs-pa-01M09N2Z.md` | reviewed, not approved (generated synthesis), page 2026-09-03. The event-type mapping is in config and is a proposal. |
| `adaptNoteLine` / `adaptNotes` | `RESCUE:` / `GAP:` / `STEPPED-IN:` / `CARD:` note lines become contract events | `vault/24_Constraints/memory-constraint-riseup-operational-visibility-must-revea-01KZD2FM.md` | approved constraint, page 2026-08-23 |
| (fence) no stage moves | The parser rejects `stage.*` types and the guard rejects stage-move keys | `vault/30_Decisions/decision-conflict-resolution-proposal-mechanical-short-window-gates-v.md` | approved 2026-08-24 |

Stage labels come from `DEFAULT_CONFIG.stageLabels` (`Dormant, Trial, Contributor, Owner, Driver, Cultivator`), because stage 0 was renamed from "Prospect" to "Dormant". Events carry only the number 0 to 5.

## Fences the code enforces

1. **Opaque ids only.** `parseEvent` / `parseJsonl` reject `name`, `email`, `firstName`, `lastName`, `fullName`, `displayName` and `phone` at any depth, and reject email-shaped values anywhere. A person id must match `^p_[a-z0-9]{3,32}$`. The contract is closed, so a name cannot hide under an unknown key.
2. **Aggregate-only output.** Every metric result goes through `aggregateOnly()` in `src/guard.ts`, which throws if a result contains `name`, `personId`, `subject`, `actor`, `rank`, `score`, `ranking`, `promotion` or `stageMove` keys, or an array of person ids. A property test runs every function over 200 random synthetic logs and checks the same thing.
3. **No ranking or scoring.** Input `rank`, `ranking`, `score` and `scores` fields are rejected. Probe 1 is judged from log counts. No individual is scored.
4. **No stage moves.** Counts may set task size only. The library never emits a stage move, and `stage.*` event types are rejected.
5. **No-shame adapter.** RESCUE and GAP lines lose any trailing actor text ("by X", "per X", "— X", "(X)"). STEPPED-IN keeps the actor only as an opaque id, as recognition. A human name is dropped, never stored.
6. **Report prints numbers only.** Free-text `summary` fields are never printed.
7. **Honest denominators.** An empty denominator gives `undefined` (shown as "n/a"), never 0 or Infinity. The ship-rate threshold is always labelled `threshold not yet validated`.
8. **Local only.** There is no network and nothing runs at import time. The CLI reads the files you name and writes only to stdout.

## Event contract

`event-contract.schema.json` (JSON Schema 2020-12) and `src/contract.ts` define the same 17 event types. A test keeps the two lists in sync. Each line looks like `{"v":1,"type":"...","at":"YYYY-MM-DD", ...}`. Blank lines and `#` comments are skipped. `fixtures/events.synthetic.jsonl` is invented data. `fixtures/bad.name.jsonl` is a negative case.

## How laptop lanes can adopt it

- **Cockpit / CLI lane:** the cockpit keeps its own briefing counts. To try this library, export a de-identified `events.jsonl` that uses opaque `p_` ids, never `riseup_*` row contents with names, and run `report`. The prefix adapter reads note text only, so no table changes are needed.
- **Capability OS / Codex lane:** treat `src/contract.ts` + `event-contract.schema.json` as a candidate shape for the stitch-contract "measurement" store, and import the pure functions from `src/index.ts`. You can copy the folder as it is. It has no runtime dependencies.
- **Owner:** the numbers are in `src/config.ts` (`shipRateThreshold`, `entrantsPerWelcomer`, the Probe 1 floors, `outputSources`). If a decision changes, change it there and the tests show what moved.

This library does not touch `riseup_*` tables, the cockpit CLI briefing, the Capability OS app or the laptop's stitch-contract store.
