"""The Markdown governance record: DRAFT banner, every gap with its source path, no names."""
import re

from conftest import ALL_INVENTORIES, ATMIYATA, RECORDS, load, minimal_field, minimal_inventory
from privacy_inventory.checks import check_inventory
from privacy_inventory.report import BANNER, render_report, scrub
from privacy_inventory.retention import POLICY_LABEL, evaluate
from datetime import date

NAME = re.compile(r"\b[A-Z][a-z]+[ \t]+[A-Z][a-z]+\b")


def build(path, **kw):
    inv = load(path)
    findings = check_inventory(inv, source=path.name)
    return inv, findings, render_report(inv, findings, source=path.name, generated_on="2026-10-17", **kw)


def test_report_starts_with_draft_banner():
    _, _, text = build(ATMIYATA)
    assert BANNER == "# DRAFT – needs owner decision"
    assert text.splitlines()[0] == BANNER
    assert "approves nothing" in text


def test_report_lists_every_gap_with_source_path():
    _, findings, text = build(ATMIYATA)
    assert findings
    for f in findings:
        assert f"`{f.source}#{f.path}`" in text, f.path
        assert f.code in text


def test_reports_for_all_fixtures_contain_no_names_or_emails():
    for path in ALL_INVENTORIES:
        _, _, text = build(path)
        assert not NAME.search(text), (path.name, NAME.search(text))
        assert "@" not in text


def test_names_smuggled_into_inventory_are_scrubbed():
    inv = minimal_inventory(minimal_field(purpose="ask Priya Shah before use, or mail lead@example.org",
                                          steward_role="Jordan Smith"))
    findings = check_inventory(inv, source="x.json")
    text = render_report(inv, findings, source="x.json", generated_on="2026-10-17")
    assert "Priya" not in text and "Jordan" not in text and "@" not in text
    assert scrub("call +1 555 010 0199 now") == "call [redacted] now"


def test_report_includes_retention_section_with_policy_label():
    records = load(RECORDS)["records"]
    results = evaluate(records, date(2026, 10, 17))
    _, _, text = build(ATMIYATA, retention_results=results, as_of="2026-10-17")
    assert POLICY_LABEL in text
    assert "REDUCE_TO_SUMMARY" in text and "DELETE" in text
    assert "tok-" not in text  # record values never reach the report, only ids and decisions
