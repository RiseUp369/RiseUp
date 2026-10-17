"""Gap rules for a participant-data inventory.

Every finding carries a path such as `stores/reflections/fields/reflection_text/retention`
so a reviewer can jump straight to the gap. Severities:

- ERROR: a governance gap; `check` exits 1.
- REVIEW_REQUIRED: a design or ownership question only the owner can settle; exits 3 if no errors.
- WARNING: worth a look; does not change the exit code.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass

from privacy_inventory.schema import load_schema, validate
from privacy_inventory.steward import is_unassigned, role_label_problems

ERROR = "ERROR"
REVIEW_REQUIRED = "REVIEW_REQUIRED"
WARNING = "WARNING"
SEVERITY_ORDER = {ERROR: 0, REVIEW_REQUIRED: 1, WARNING: 2}

IDENTIFIERS = {"direct_identifier", "contact", "quasi_identifier"}
EXPORT_FORBIDDEN_CONTENT = {"raw_operations", "commitment", "private_context"}
EXPORT_ALLOWED_CONTENT = {"reviewed_learning", "aggregate_stat"}
SECRET_LIKE_NAME = re.compile(r"(access_?code|entry_?code|pass_?code|password|passwd|secret|api_?key|(^|_)pin($|_))")


@dataclass(frozen=True)
class Finding:
    severity: str
    code: str
    path: str
    message: str
    source: str = "inventory"

    def to_dict(self) -> dict:
        return asdict(self)


def _blank(value) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def check_inventory(inv: dict, source: str = "inventory") -> list[Finding]:
    findings: list[Finding] = []

    def add(sev, code, path, msg):
        findings.append(Finding(sev, code, path, msg, source))

    schema_errors = validate(inv, load_schema())
    if schema_errors:
        for path, msg in schema_errors:
            add(ERROR, "SCHEMA_INVALID", path, msg)
        return _sorted(findings)

    domestic = inv["domestic_jurisdiction"]
    disclosed = set((inv.get("consent") or {}).get("disclosed_processor_locations") or [])
    rules = inv.get("retention_rules") or {}

    for store in inv["stores"]:
        sbase = f"stores/{store['id']}"
        processor = store.get("processor") or {}
        store_steward = store.get("steward_role")
        if not _blank(store_steward) and role_label_problems(store_steward):
            add(ERROR, "STEWARD_NOT_ROLE", f"{sbase}/steward_role",
                "steward must be a role label: " + "; ".join(role_label_problems(store_steward)))
        if not processor:
            add(WARNING, "MISSING_PROCESSOR", f"{sbase}/processor",
                "store does not say where the data is processed")
        outside = bool(processor.get("outside_service")) or (
            processor.get("location") not in (None, domestic))

        for field in store["fields"]:
            base = f"{sbase}/fields/{field['name']}"
            cls = field["classification"]

            # 1. purpose / consent / retention / deletion
            if _blank(field.get("purpose")):
                add(ERROR, "MISSING_PURPOSE", f"{base}/purpose", "no purpose stated")
            if _blank(field.get("consent_basis")) or field.get("consent_basis") == "none":
                add(ERROR, "MISSING_CONSENT_BASIS", f"{base}/consent_basis", "no consent basis recorded")
            elif field["consent_basis"] == "not_required_anonymous" and cls in IDENTIFIERS | {"free_text"}:
                add(ERROR, "ANONYMOUS_BASIS_ON_IDENTIFYING_FIELD", f"{base}/consent_basis",
                    f"'not_required_anonymous' cannot cover a {cls} field")
            retention = field.get("retention")
            if _blank(retention):
                if cls == "free_text":
                    add(ERROR, "FREE_TEXT_NO_RETENTION", f"{base}/retention",
                        "free text has no retention rule")
                else:
                    add(ERROR, "MISSING_RETENTION", f"{base}/retention", "no retention rule")
            elif retention not in rules:
                add(ERROR, "UNKNOWN_RETENTION_RULE", f"{base}/retention",
                    "retention refers to a rule not defined in retention_rules")
            if _blank(field.get("deletion_path")):
                add(ERROR, "MISSING_DELETION_PATH", f"{base}/deletion_path",
                    "no path for a deletion request to reach this field")
            if _blank(field.get("visibility")):
                add(ERROR, "MISSING_VISIBILITY", f"{base}/visibility", "visibility not stated")

            # 2. identifiers made public
            if cls in IDENTIFIERS and field.get("visibility") == "public":
                add(ERROR, "IDENTIFIER_PUBLIC", f"{base}/visibility", f"{cls} field is publicly visible")
            if cls == "pseudonymous" and field.get("visibility") == "public":
                add(WARNING, "PSEUDONYM_PUBLIC", f"{base}/visibility",
                    "a public pseudonymous token can be linked back to a person")

            # 3. free text governance
            if cls == "free_text" and field.get("moderation") in (None, "", "none"):
                add(ERROR, "FREE_TEXT_NO_MODERATION", f"{base}/moderation",
                    "free text has no moderation or review rule")

            # 4. secrets and access codes
            secret = field.get("secret")
            if secret and secret.get("storage") == "raw":
                add(ERROR, "RAW_SECRET_STORED", f"{base}/secret/storage",
                    f"raw {secret.get('kind', 'secret')} stored; store a hash or nothing")
            if not secret and SECRET_LIKE_NAME.search(field["name"]):
                add(ERROR, "UNDECLARED_SECRET_LIKE_FIELD", f"{base}/secret",
                    "field name looks like a secret or access code but declares no secret storage")

            # 5. sensitive design
            if cls == "sensitive_design":
                add(REVIEW_REQUIRED, "SENSITIVE_DESIGN", base,
                    "sensitive design choice (for example a segregated participant flow); owner review required")

            # 6. processor location vs consent disclosure
            location = field.get("processor_location") or processor.get("location")
            if location and location != domestic and location not in disclosed:
                add(ERROR, "PROCESSOR_NOT_DISCLOSED",
                    f"{base}/processor_location" if field.get("processor_location") else f"{sbase}/processor/location",
                    f"processor location '{location}' is outside '{domestic}' and not named in the consent notice")

            # 7. world-model v2 export eligibility
            if field.get("export_eligible"):
                kind = field.get("content_kind")
                if kind in EXPORT_FORBIDDEN_CONTENT:
                    add(ERROR, "EXPORT_NOT_REVIEWED_LEARNING", f"{base}/export_eligible",
                        f"{kind} must never leave in a learning export; only reviewed, de-identified learning may")
                elif kind not in EXPORT_ALLOWED_CONTENT:
                    add(ERROR, "EXPORT_NOT_REVIEWED_LEARNING", f"{base}/export_eligible",
                        f"content kind '{kind}' is not reviewed learning or an aggregate statistic")
                if cls in IDENTIFIERS | {"free_text", "pseudonymous"}:
                    add(ERROR, "EXPORT_IDENTIFIER", f"{base}/export_eligible",
                        f"{cls} field marked export-eligible; exports must be de-identified")

            # 8. steward role
            steward = field.get("steward_role")
            steward_path = f"{base}/steward_role"
            if _blank(steward):
                steward, steward_path = store_steward, f"{sbase}/steward_role"
            if _blank(steward):
                add(ERROR, "MISSING_STEWARD_ROLE", f"{base}/steward_role", "no steward role on field or store")
            elif steward_path.startswith(base) and role_label_problems(steward):
                add(ERROR, "STEWARD_NOT_ROLE", steward_path,
                    "steward must be a role label: " + "; ".join(role_label_problems(steward)))
            elif is_unassigned(steward) and outside:
                add(REVIEW_REQUIRED, "STEWARD_UNASSIGNED", steward_path,
                    "copy held by an outside service has no data-steward role; the owner assigns one")

    return _dedupe(_sorted(findings))


def _sorted(findings):
    return sorted(findings, key=lambda f: (SEVERITY_ORDER[f.severity], f.path, f.code))


def _dedupe(findings):
    seen, out = set(), []
    for f in findings:
        key = (f.severity, f.code, f.path)
        if key not in seen:
            seen.add(key)
            out.append(f)
    return out


def counts(findings) -> dict:
    out = {ERROR: 0, REVIEW_REQUIRED: 0, WARNING: 0}
    for f in findings:
        out[f.severity] += 1
    return out


def exit_code(findings) -> int:
    c = counts(findings)
    if c[ERROR]:
        return 1
    if c[REVIEW_REQUIRED]:
        return 3
    return 0
