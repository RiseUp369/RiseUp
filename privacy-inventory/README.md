# privacy-inventory

Privacy as code for participant data. Each system lists its stores and fields in a JSON inventory. A checker flags governance gaps, a retention command decides what happens to each record, and a report command writes a **DRAFT** governance record for the owner. The tool approves nothing.

The package uses only the Python 3.13 standard library. It makes no network calls and holds no secrets. pytest is the only development dependency.

## Why

The connection-event (Atmiyata) prototype carries an unresolved importance-5 risk. It holds participant identity, matching and reflection data, but has no consent, retention, access or correction record. Evidence:

- `vault/80_Risks/memory-unresolved_risk-atmiyata-participant-data-prototype-lack-01KZDJ8N.md`
- `vault/30_Decisions/decision-atmiyata-prototype-makes-participant-reflection-optional.md` (retention unset)
- `vault/30_Decisions/decision-atmiyata-prototype-separates-its-data-spine-from-visual-fram.md`
- Owner session 2026-10-13: RD-49 option B. Records are kept 3 years, then reduced to a summary, and a deletion request overrides both. US processors must be named in the consent notice. A data-steward role is still needed.
- `vault/30_Decisions/decision-riseup-world-model-v2-detachable-organisational-truth-with-c.md`: only reviewed, de-identified learning may be exported.
- Session OS rule: raw access codes are never stored.

This tool turns those rules into checks, so every lane can produce the same evidence. It does not name a data steward, because only the owner names people.

## Run

```sh
cd privacy-inventory
python -m pip install -r requirements-dev.txt   # pytest only, for the tests
python -m pytest

python -m privacy_inventory check fixtures/atmiyata-prototype.synthetic.json        # exits 1
python -m privacy_inventory check fixtures/anonymous-poll.synthetic.json            # exits 0
python -m privacy_inventory retention --as-of 2026-10-17 fixtures/records.synthetic.json
python -m privacy_inventory report fixtures/atmiyata-prototype.synthetic.json \
    --records fixtures/records.synthetic.json --as-of 2026-10-17 -o governance-draft.md
```

`check` exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Clean. Warnings may still be printed. |
| 1 | Errors were found. |
| 2 | The input is unreadable or an argument is bad. |
| 3 | There are no errors, but REVIEW_REQUIRED items need the owner. |

Add `--format json` to `check` or `retention` for machine-readable output.

## What `check` flags

| Code | Severity | Rule |
| --- | --- | --- |
| MISSING_PURPOSE / MISSING_CONSENT_BASIS / MISSING_RETENTION / MISSING_DELETION_PATH / MISSING_VISIBILITY | ERROR | Every field states its purpose, consent basis, retention rule, deletion path and visibility. A consent basis of `none` counts as missing. |
| UNKNOWN_RETENTION_RULE | ERROR | The retention id is not defined in `retention_rules`. |
| IDENTIFIER_PUBLIC | ERROR | A direct identifier, contact field or quasi-identifier has `public` visibility. |
| FREE_TEXT_NO_RETENTION / FREE_TEXT_NO_MODERATION | ERROR | Free text has no retention rule or no moderation rule. |
| RAW_SECRET_STORED / UNDECLARED_SECRET_LIKE_FIELD | ERROR | An access code or secret is stored raw, or a field that looks like one does not declare how it is stored. |
| SENSITIVE_DESIGN | REVIEW_REQUIRED | A sensitive design choice, such as a segregated participant flow. |
| PROCESSOR_NOT_DISCLOSED | ERROR | The processor is outside `domestic_jurisdiction` and the consent notice does not name its location. |
| EXPORT_NOT_REVIEWED_LEARNING / EXPORT_IDENTIFIER | ERROR | A field marked as eligible for World Model v2 export holds raw operations, commitments, private context or identifiers. |
| MISSING_STEWARD_ROLE / STEWARD_NOT_ROLE | ERROR | The steward is missing, or is not a role label. A role label is lower case and has no `@`, no two capitalised words in a row and no phone number. |
| STEWARD_UNASSIGNED | REVIEW_REQUIRED | An outside service holds a copy and no steward role has been assigned. |
| SCHEMA_INVALID | ERROR | The inventory does not match `inventory.schema.json`. |

## Retention (RD-49 option B defaults, owner, 2026-10-13)

`retention --as-of DATE records.json` prints one decision per record:

- **DELETE** when a deletion request is dated on or before the as-of date. This always takes priority.
- **KEEP** while the as-of date is earlier than `last_activity` + 3 years. On the third anniversary the window has closed. An anchor of 29 February counts as 28 February in the anniversary year.
- **REDUCE_TO_SUMMARY** once the window has closed. The summary keeps `profile`, `confirmed_skills` (only confirmed skills that have a review date) and `participation_summary` (event count, first date and last date). The output lists which fields are dropped.

Pass `--policy policy.json` to override any default, for example `{"keep_years": 2}`. Overridden output is relabelled as a custom override. One question is left for the owner: how long the summary itself is kept. `summary_keep_years` defaults to none, which means summaries are never deleted automatically.

## Fixtures (all synthetic)

- `atmiyata-prototype.synthetic.json`: a connection-event spine with a token, centre, phone lookup, connection log and optional reflection. It describes fields only. No content from the source pages is copied.
- `anonymous-poll.synthetic.json`: anonymous live-poll counts and a short-lived device nonce. It passes with zero errors.
- `volunteer-tracker.synthetic.json`: a generic volunteer tracker. Its only gap is a commitment field that is marked export-eligible.
- `records.synthetic.json`: invented records for the retention command.

## How a lane adopts it

1. Copy `inventory.schema.json` and write `<system>.inventory.json` next to your code. List field descriptions only, never participant values. Use role labels for stewards, for example `data steward`, `session lead` or `unassigned`.
2. Run `python -m privacy_inventory check <file>` in CI or before a release. Treat exit code 1 as blocking and exit code 3 as waiting for the owner.
3. Run `report` and attach the DRAFT record to the owner's decision queue. The owner decides. This tool only collects the evidence.

This lane touched nothing outside `privacy-inventory/`. That includes the RD-49 memo, the backup scripts, the filing secret stripper, Session OS and any live data.
