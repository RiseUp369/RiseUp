# fence-lint

A text linter that checks agent output and outward copy against RiseUp's approved doctrine fences, plus an evaluation harness that proves the rules still catch what they should.

## Why

RiseUp now runs agent-native: briefings, cards, handoffs and course copy are written by AI. The fences below were approved, but they existed only as prose, and the system map's L6 gap says outward copy rules exist but "no review step checks them". The owner also asked that agents not game the system. fence-lint adds that review step as rules-as-data that any lane can run on its own outputs. It changes no app and no permissions, and it holds no roster or volunteer data.

The evidence for each rule is the vault page named in its `source` field (paths are relative to the brain checkout):

| Rule | Severity | Profiles | Fence | Source |
| --- | --- | --- | --- | --- |
| F1 | error | all | No names in `RESCUE:` / `GAP:` lines (roster supplied at runtime, plus `@handles`). `STEPPED-IN:` keeps names. | `vault/30_Decisions/decision-riseup-os-deploys-through-the-existing-cockpit-cli-and-monda.md` |
| F2 | error | all | No ranking or scoring of people (`rank #`, top performer, leaderboard, a numeric score next to a person reference) | `vault/24_Constraints/memory-constraint-riseup-operational-visibility-must-revea-01KZD2FM.md` |
| F3 | error | all | No inferring empathy, personality, charisma, employability or leadership potential from voice, accent, face or talk-time | `vault/24_Constraints/memory-constraint-riseup-ai-may-support-learning-but-may-n-01KZD2H4.md` |
| F4 | error | all | No warm-contact or headcount numbers in documents: say "see the tracker" | `vault/30_Decisions/decision-conflict-resolution-proposal-warm-contact-count-6-driver-eng.md` |
| F5 | error | all | Only the ladder names a stage (`config/ladder.json`); flags rival labels and number/label mismatches | `vault/30_Decisions/decision-conflict-resolution-proposal-the-rival-volunteer-progression.md` |
| F6 | error | outward | No internal or prestige jargon in outward copy (`config/outward-terms.json`, with plain replacements) | `vault/30_Decisions/decision-keep-the-depth-drop-the-philosophy-jargon-outward-facing-cop.md` (see also `vault/50_Failures/memory-failure_lesson-internal-jargon-that-was-removed-came-ba-01M1QHYR.md`) |
| F7 | error | all | No automatic miss-count consequences ("three strikes", "two misses and out") | `vault/24_Constraints/memory-constraint-riseup-accountability-consequences-are-p-01KZD2G1.md` |
| F8 | warn | outward | Gatekeeping phrasing in outer-funnel copy, flagged for human review only | `vault/30_Decisions/decision-riseup-two-layer-structure-separates-outer-service-funnel-fr.md` |
| FL0 | error | all | Built in: a `fence-lint-disable` without a reason of at least 3 words, or one that names an unknown rule | (engine) |

Status notes: F5's source decision is approved but marked stale in the vault, and the stage-0 word has drifted (Prospect vs Dormant). The ladder file uses the labels the cockpit CLI ships (Dormant, Trial, Contributor, Owner, Driver, Cultivator), so if the owner ratifies a different word, edit `config/ladder.json`. F6's source decision is still proposed.

## Run

Node 22.18 or later runs the TypeScript directly. There are no runtime dependencies and no network access, and the tool writes nothing.

```sh
cd fence-lint && npm install          # dev deps only: vitest, typescript, @types/node (pinned)
npm test                              # vitest suite
npm run eval                          # precision/recall per rule on corpus/, exits 1 on any regression
node src/cli.ts --profile outward page.md
cat briefing.md | node src/cli.ts --profile agent-report --roster roster.local.txt --json -
node src/cli.ts --list-rules
```

- **Profiles:** `outward` (public copy, course pages, invites), `internal` (docs, plans), `agent-report` (briefings, cards, handoffs; the default), or `all`.
- **Output:** text is `file:line:col  severity  rule  message`. `--json` adds a `suppressed` list and a summary.
- **Exit codes:** 0 when there are no error-severity findings (warnings allowed), 1 when there is at least one error, 2 for a usage or read failure.
- **Roster:** pass `--roster`, set `$FENCE_LINT_ROSTER`, or put a `roster.local.txt` in the working directory or here. The format is one person per line, with aliases separated by `|`. Files matching `*.local.*` are gitignored, so a real roster never enters git. Names in findings print as `[redacted]`. Without a roster, F1 checks only `@handles`.
- **Extra terms:** use `--terms my-terms.local.json` (`{"terms":[{"term":"...","suggest":"..."}]}`) or a `.txt` file with one term per line.
- **Disable inline,** with a mandatory reason: `<!-- fence-lint-disable F2 -- quoting the rejected draft verbatim -->` (`//`, `#` and `/* */` work too). A trailing comment covers its own line. A comment on a line by itself covers the next non-blank line. Suppressed findings are still reported with their reason, so a reviewer can see every override.

## Evaluation harness

`corpus/manifest.json` labels every sample. Each `bad/` sample lists its complete expected findings (rule and line), and each `good/` sample expects none. `npm run eval` prints tp, fp, fn, precision and recall for each rule. It exits 1 in any of these cases:

- any rule's recall drops below 1.0
- any rule has no `bad/` sample
- any `good/` sample produces a finding
- a `bad/` sample produces an unexpected finding

`test/fixtures/regress-corpus/` is a deliberately broken corpus. The tests use it to prove that the non-zero exit works. All corpus text and roster names are invented and flagged `SYNTHETIC` on their first line.

## How lanes adopt it

1. Copy or vendor this folder, or run it in place: `node <path>/fence-lint/src/cli.ts`.
2. Lint your output before you hand it off. For example, a briefing lane runs `... --profile agent-report briefing.md`, and a course or promo lane runs `... --profile outward page.md`. Treat exit 1 as "fix before posting".
3. Keep your real roster or term list in a `*.local.*` file next to where you run it. Never commit it.
4. When a rule misses something or fires wrongly, add a labelled sample to `corpus/` first, then change the rule JSON until `npm run eval` passes again.

Library use: `import { loadRules, loadContext, lintText } from './src/index.ts'`.

Limits (v1): rules are regexes over sentences, so paraphrases can slip through. F2 and F7 skip a match when a negation sits within 3 words before it (for example "we never keep a leaderboard"), and F3 and F7 skip a sentence that states the doctrine itself ("must not infer", "is not adopted"). Treat findings as a review step, not a verdict on the author.
