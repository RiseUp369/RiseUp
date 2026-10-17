"""Retention decisions per record: KEEP, REDUCE_TO_SUMMARY or DELETE.

Defaults follow RD-49 option B as chosen by the owner on 2026-10-13: keep for 3 years
from last activity, then reduce to a summary; a deletion request always wins.
Open points left for the owner (not invented here): how long the summary itself
is kept (`summary_keep_years`, default None = no automatic deletion of summaries).
"""
from __future__ import annotations

import copy
from datetime import date

KEEP = "KEEP"
REDUCE_TO_SUMMARY = "REDUCE_TO_SUMMARY"
DELETE = "DELETE"

POLICY_LABEL = "RD-49 option B defaults (owner, 2026-10-13)"

DEFAULT_POLICY: dict = {
    "label": POLICY_LABEL,
    "keep_years": 3,
    "anchor_field": "last_activity",
    "deletion_request_field": "deletion_requested_on",
    "deletion_request_overrides": True,
    "summary_fields": ["profile", "confirmed_skills", "participation_summary"],
    "summary_keep_years": None,
}


def make_policy(overrides: dict | None = None) -> dict:
    policy = copy.deepcopy(DEFAULT_POLICY)
    if overrides:
        policy.update({k: v for k, v in overrides.items() if k != "label"})
        policy["label"] = overrides.get("label") or f"custom override of {POLICY_LABEL}"
    return policy


def parse_date(value) -> date | None:
    if value in (None, ""):
        return None
    return date.fromisoformat(str(value))


def add_years(d: date, years: int) -> date:
    """Same calendar day `years` later; 29 February clamps to 28 February."""
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        return d.replace(year=d.year + years, day=28)


def build_summary(record: dict) -> dict:
    skills = [
        {"skill": s.get("skill"), "review_date": s.get("review_date")}
        for s in record.get("skills") or []
        if s.get("confirmed") and s.get("review_date")
    ]
    dates = sorted(p["date"] for p in record.get("participation") or [] if p.get("date"))
    participation = record.get("participation_summary") or {
        "events": len(record.get("participation") or []),
        "first": dates[0] if dates else None,
        "last": dates[-1] if dates else None,
    }
    return {
        "profile": record.get("profile"),
        "confirmed_skills": skills,
        "participation_summary": participation,
    }


def decide(record: dict, as_of: date, policy: dict | None = None) -> dict:
    policy = policy or DEFAULT_POLICY
    rid = record.get("id", "(no id)")
    deletion = parse_date(record.get(policy["deletion_request_field"]))
    if policy["deletion_request_overrides"] and deletion and deletion <= as_of:
        return {"id": rid, "decision": DELETE,
                "reason": f"deletion request dated {deletion.isoformat()} overrides retention"}

    anchor = parse_date(record.get(policy["anchor_field"]))
    if anchor is None:
        return {"id": rid, "decision": KEEP,
                "reason": f"no {policy['anchor_field']} date; kept pending steward review"}

    keep_until = add_years(anchor, policy["keep_years"])
    if as_of < keep_until:
        return {"id": rid, "decision": KEEP,
                "reason": f"within {policy['keep_years']}-year window (until {keep_until.isoformat()})"}

    if policy.get("summary_keep_years") is not None:
        summary_until = add_years(keep_until, policy["summary_keep_years"])
        if as_of >= summary_until:
            return {"id": rid, "decision": DELETE,
                    "reason": f"summary period ended {summary_until.isoformat()}"}

    summary = build_summary(record)
    summary = {k: v for k, v in summary.items() if k in policy["summary_fields"]}
    kept_sources = {"id", "profile", "participation_summary"}
    drop = sorted(k for k in record if k not in kept_sources and k != policy["deletion_request_field"])
    return {"id": rid, "decision": REDUCE_TO_SUMMARY,
            "reason": f"{policy['keep_years']}-year window ended {keep_until.isoformat()}",
            "summary": summary, "drop_fields": drop}


def evaluate(records: list[dict], as_of: date, policy: dict | None = None) -> list[dict]:
    return [decide(r, as_of, policy) for r in records]
