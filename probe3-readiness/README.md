# probe3-readiness

A readiness gate and step-back drill kit for **Probe 3**, the founder's multi-month absence that starts in November 2026. It is a TypeScript library and CLI with no runtime dependencies. It makes no network calls and writes only to stdout.

> **Doctrine status: v0.1 / unratified.** Every rule this kit checks comes from proposal-stage doctrine. A verdict is a readiness signal. It is not a ratified decision.

## Why

The approved red-team guard says coast mode must be pre-wired while the organisation is still in growth mode. That means a named holder, a written handoff, and at least one live rehearsal ([red-team guard 3](#doctrine-sources)). As of 2026-10-17 no rehearsal is on record, and 23 of the 27 steward-sheet rules are still owned by "founder". No lane owns a readiness gate or a drill. The cockpit CLI `handoff` command prints a one-pager from live data, but it does not check readiness or script a rehearsal. This kit fills that gap and does not duplicate the cockpit.

## Run it

```sh
npm install            # dev-only: vitest (pinned)
npm test               # 45 vitest cases
node --experimental-strip-types src/cli.ts check fixtures/plan-not-ready.json        # exit 1, lists every gap with its source path
node --experimental-strip-types src/cli.ts check fixtures/plan-ready.json            # exit 0, READY
node --experimental-strip-types src/cli.ts check fixtures/plan-under-prepared.json   # exit 2, SHRINK_TO_COAST + Branch C guidance
node --experimental-strip-types src/cli.ts drill   fixtures/plan-ready.json > private/drill.md
node --experimental-strip-types src/cli.ts handoff fixtures/plan-ready.json --format html > private/handoff.html
node --experimental-strip-types src/cli.ts import-stewards my-plan.local.json private/stewards.csv > merged.local.json
```

The `npm run check|drill|handoff|import-stewards -- <args>` scripts do the same. Requires Node 22.6 or later (`--experimental-strip-types`).

| Command | Output | Exit codes |
|---|---|---|
| `check <plan> [--json] [--max-per-holder N] [--today YYYY-MM-DD]` | Verdict, every gap with its source path(s), holder load, both Runway variants, advice | 0 READY, 1 NOT_READY, 2 SHRINK_TO_COAST, 3 invalid input |
| `drill <plan> [--date YYYY-MM-DD]` | Markdown tabletop script: Branches A–E, the 3 emergency classes, and 2 "curriculum" control injects. Each inject has a pre-committed response and a blank line for recording the result. | 0 / 3 |
| `handoff <plan> [--format md\|html]` | Printable one-page sheet | 0 / 3 |
| `import-stewards <plan> <sheet.csv\|sheet.md>` | The plan JSON with the sheet folded into `scope` | 0 / 3 |

### Verdicts

- **NOT_READY**: at least one blocking gap, meaning coast mode itself is not pre-wired.
- **SHRINK_TO_COAST** (Branch C): coast mode is pre-wired, but there is no second Owner or the co-driver has not passed Vacuum Level 3. Do not fake readiness. Run coast mode only, and announce the reduced scope as a maintenance season before leaving.
- **READY**: no gaps.

Gap codes: `NO_PRIMARY_HOLDER`, `NO_PRIMARY_BACKUP`, `SCOPE_NO_HOLDER`, `SCOPE_HELD_BY_FOUNDER`, `SCOPE_NO_BACKUP`, `SCOPE_NEEDS_FOUNDER`, `HOLDER_OVERLOAD` (one holder carries more than N scope items; N comes from the plan's `thresholds.maxScopePerHolder` or `--max-per-holder` and defaults to 5), `RESPONSE_WINDOW_NOT_FIXED`, `EMERGENCY_CLASS_UNROUTED`, `HEARTBEAT_INCOMPLETE`, `HANDOFF_NOT_WRITTEN`, `HANDOFF_RITUAL_NOT_DONE`, `NO_REHEARSAL` (a tabletop drill does not count), `NO_ZERO_OPS_WEEK`, `NO_REUNION_DATE`, `REUNION_NOT_ANNOUNCED`, `REUNION_TOO_LATE`, `UNDER_PREPARED_NO_SECOND_OWNER`, `UNDER_PREPARED_VACUUM_L3`.

## Input format

`absence-plan.schema.json` (JSON Schema 2020-12) is the contract. `src/schema.ts` validates against it without dependencies. A plan has these parts:

- `absence`: departure and return dates, the founder role, and the primary holder and backup roles.
- `roles`: every role label used anywhere in the plan, such as `"Holder A"` or `"Welcomer D"`. Holders, backups and first responders must be labels from this list. **Never put names or contacts here.** A field named `name` or `email` anywhere in the plan is rejected, and so is any label containing `@`.
- `responseWindow`: weekly, on one fixed day.
- `emergencyInterrupts`: the three classes (`harm_to_person`, `reputational_damage`, `money_legal`), each with a first-responder role.
- `scope[]`: `id`, `title`, `holder`, `backup`, `runsWithoutFounder`. An empty string means nobody holds the item yet, which is reported as a gap.
- `heartbeat`: the peer session (cadence and rotating host), the async pulse, and the warmth loop.
- `runwayGate`: coast page written, handoff ritual done, and a zero-ops week (`start`, `end`, `founderInterventions`).
- `formation`: owners besides the founder, and whether the co-driver passed Vacuum Level 3. These are the Branch C inputs.
- `reunion`: the date, and whether it has been announced.
- `rehearsals[]`: each entry has `date`, `kind` (`live-step-back` or `tabletop`) and `holderActedWithoutFounder`.

`import-stewards` reads a CSV or Markdown table with the columns `rule | owner | backup | runs_without_founder`. This is the laptop steward-sheet format. The kit hard-codes no rules. An owner cell of `founder` maps to the plan's founder role, and new labels are added to `roles` as role labels. A cell that looks like a contact is refused.

### Keep real plans private

Fixtures are synthetic and use labels like "Holder A". A real plan or steward sheet must live in a gitignored `*.local.json` file (or `*.local.csv`, `*.local.md` or `private/`). See `.gitignore`. Only the owner maps role labels to people, and that mapping stays outside this kit.

## Runway v0.1: both variants shown, unreconciled

The Runway Phase 4 -> T-0 gate (coast page written, handoff ritual done, one full week with zero founder interventions) has the same wording in both archived variants. **Attachment-023** adds a mandatory First-14-Days intake routing step for warm-list yeses. **Attachment-024** does not have that step. No record decides between them. The kit shows both in `check` and `handoff`, labels them *unreconciled*, and does not pick one.

## Doctrine sources

`vault/` means `jpopenbrain/vault`. The brain paths are under `jpopenbrain/docs/riseup-brain/attic-vault-r1b/RiseUp_Brain/`. Every gap cites one or more of these paths (see `src/doctrine.ts`):

- Red-team guard 3 (approved 2026-08-24): `vault/30_Decisions/decision-conflict-resolution-proposal-the-five-red-team-critiques-bec.md`
- Two operating modes: `vault/30_Decisions/decision-riseup-two-operating-modes-growth-and-coast-the-historical-t.md`
- Rehearse before it is real: `vault/40_Patterns/memory-reusable_pattern-riseup-absence-protocol-should-be-rehear-01KZJ9TA.md`
- Runway v0.1 design card (gates, variants 023/024): `vault/40_Patterns/memory-reusable_pattern-runway-v0-1-consolidated-design-card-a-f-01KZP40N.md`
- Probe 3 feature: `vault/22_Features/feature-probe-3-01KZDJ8M.md`
- Three emergency interrupts and the weekly window: `…/RiseUp_Brain/Absence Contingency Tree defines exactly 3 emergency interrupts and a fixed once.md`
- Contingency Branches A–E: `…/RiseUp_Brain/Contingency Branch {A..E}_ ….md`

Drill responses are neutral paraphrases. The spiritual framing in the source notes is not copied.

## How laptop lanes can adopt it

- **Owner:** copy `fixtures/plan-ready.json` to `my-probe3.local.json`, export the steward sheet to `private/stewards.csv`, and run `import-stewards` and then `check`. Work down the gap list. Run `drill` with the holders, then log a live step-back in `rehearsals`.
- **Cockpit lane:** the kit never reads the cockpit, the `riseup_*` tables, or the cockpit CLI. If wanted, the cockpit `handoff` command could link to this sheet. Nothing here changes it.
- **Capability OS / catalogue (Codex lanes):** untouched. The gate and drill can be catalogued as an artifact.

## Not in scope

The kit does not read production data, read or write the cockpit repo, write files, or ratify doctrine.
