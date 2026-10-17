"""Retention decisions under RD-49 option B defaults (owner, 2026-10-13)."""
from datetime import date

from conftest import RECORDS, load
from privacy_inventory.retention import (
    DEFAULT_POLICY,
    DELETE,
    KEEP,
    POLICY_LABEL,
    REDUCE_TO_SUMMARY,
    add_years,
    decide,
    evaluate,
    make_policy,
)

AS_OF = date(2026, 10, 17)


def rec(**kw):
    base = {"id": "r", "last_activity": "2023-10-17", "profile": {"token": "t"}}
    base.update(kw)
    return base


def test_default_policy_is_labelled_and_matches_rd49_option_b():
    assert POLICY_LABEL == "RD-49 option B defaults (owner, 2026-10-13)"
    assert DEFAULT_POLICY["label"] == POLICY_LABEL
    assert DEFAULT_POLICY["keep_years"] == 3
    assert DEFAULT_POLICY["deletion_request_overrides"] is True
    assert DEFAULT_POLICY["summary_fields"] == ["profile", "confirmed_skills", "participation_summary"]


def test_exact_three_year_boundary():
    # Day before the third anniversary: still inside the 3-year window.
    assert decide(rec(last_activity="2023-10-18"), AS_OF)["decision"] == KEEP
    # On the third anniversary the 3 years are complete.
    assert decide(rec(last_activity="2023-10-17"), AS_OF)["decision"] == REDUCE_TO_SUMMARY
    assert decide(rec(last_activity="2020-01-01"), AS_OF)["decision"] == REDUCE_TO_SUMMARY


def test_leap_day_anchor_clamps_to_28_february():
    assert add_years(date(2024, 2, 29), 3) == date(2027, 2, 28)
    assert decide(rec(last_activity="2024-02-29"), date(2027, 2, 27))["decision"] == KEEP
    assert decide(rec(last_activity="2024-02-29"), date(2027, 2, 28))["decision"] == REDUCE_TO_SUMMARY


def test_deletion_request_takes_priority_over_keep_and_summary():
    fresh = decide(rec(last_activity="2026-10-01", deletion_requested_on="2026-10-02"), AS_OF)
    assert fresh["decision"] == DELETE
    old = decide(rec(last_activity="2019-01-01", deletion_requested_on="2026-10-17"), AS_OF)
    assert old["decision"] == DELETE
    assert "deletion request" in old["reason"]


def test_deletion_request_dated_after_as_of_is_not_yet_in_force():
    out = decide(rec(last_activity="2026-09-01", deletion_requested_on="2026-12-01"), AS_OF)
    assert out["decision"] == KEEP


def test_summary_field_set_is_profile_confirmed_skills_and_participation_summary():
    record = rec(
        last_activity="2023-10-17",
        skills=[
            {"skill": "setup crew", "confirmed": True, "review_date": "2023-09-01"},
            {"skill": "welcoming", "confirmed": False},
            {"skill": "unreviewed", "confirmed": True},
        ],
        participation=[{"event": "e1", "date": "2022-05-01"}, {"event": "e2", "date": "2023-10-17"}],
        reflections=["text"],
        phone_lookup="000",
    )
    out = decide(record, AS_OF)
    assert out["decision"] == REDUCE_TO_SUMMARY
    summary = out["summary"]
    assert set(summary) == {"profile", "confirmed_skills", "participation_summary"}
    assert summary["confirmed_skills"] == [{"skill": "setup crew", "review_date": "2023-09-01"}]
    assert summary["participation_summary"] == {"events": 2, "first": "2022-05-01", "last": "2023-10-17"}
    assert set(out["drop_fields"]) == {"skills", "participation", "reflections", "phone_lookup", "last_activity"}


def test_policy_is_configurable_and_relabelled():
    policy = make_policy({"keep_years": 1})
    assert policy["keep_years"] == 1
    assert POLICY_LABEL in policy["label"] and "override" in policy["label"]
    assert decide(rec(last_activity="2025-10-17"), AS_OF, policy)["decision"] == REDUCE_TO_SUMMARY


def test_missing_anchor_is_kept_and_flagged():
    out = decide({"id": "x"}, AS_OF)
    assert out["decision"] == KEEP and "steward review" in out["reason"]


def test_fixture_records_decisions():
    results = evaluate(load(RECORDS)["records"], AS_OF)
    assert {r["id"]: r["decision"] for r in results} == {
        "rec-001": KEEP,
        "rec-002": REDUCE_TO_SUMMARY,
        "rec-003": KEEP,
        "rec-004": DELETE,
        "rec-005": KEEP,
    }
