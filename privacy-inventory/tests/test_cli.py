"""CLI behaviour: `python -m privacy_inventory check|retention|report`."""
import json
import subprocess
import sys

from conftest import ATMIYATA, POLL, RECORDS, ROOT, TRACKER
from privacy_inventory.cli import main


def run_module(*args):
    return subprocess.run([sys.executable, "-m", "privacy_inventory", *args], cwd=ROOT,
                          capture_output=True, text=True, timeout=60)


def test_module_check_atmiyata_exits_nonzero_with_headline_gaps():
    proc = run_module("check", "fixtures/atmiyata-prototype.synthetic.json")
    assert proc.returncode == 1
    out = proc.stdout
    assert "FREE_TEXT_NO_RETENTION" in out and "reflection_text" in out
    assert "FREE_TEXT_NO_MODERATION" in out
    assert "MISSING_CONSENT_BASIS" in out and "phone_lookup/fields/phone_number" in out
    assert "REVIEW_REQUIRED" in out and "matching_pool" in out


def test_check_poll_exits_zero(capsys):
    assert main(["check", str(POLL)]) == 0
    assert "0 error" in capsys.readouterr().out


def test_check_json_format(capsys):
    assert main(["check", str(TRACKER), "--format", "json"]) == 1
    data = json.loads(capsys.readouterr().out)
    assert data["counts"]["ERROR"] == 2
    assert data["findings"][0]["path"].startswith("stores/")


def test_check_unreadable_file_exits_2(tmp_path, capsys):
    bad = tmp_path / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    assert main(["check", str(bad)]) == 2


def test_schema_invalid_inventory_exits_1(tmp_path, capsys):
    p = tmp_path / "inv.json"
    p.write_text(json.dumps({"inventory_version": "1", "system": "x", "stores": []}), encoding="utf-8")
    assert main(["check", str(p)]) == 1
    assert "SCHEMA" in capsys.readouterr().out


def test_retention_cli_prints_label_and_decisions(capsys):
    assert main(["retention", "--as-of", "2026-10-17", str(RECORDS)]) == 0
    out = capsys.readouterr().out
    assert "RD-49 option B defaults (owner, 2026-10-13)" in out
    assert "rec-002" in out and "REDUCE_TO_SUMMARY" in out and "DELETE" in out


def test_retention_cli_rejects_bad_date(capsys):
    assert main(["retention", "--as-of", "17/10/2026", str(RECORDS)]) == 2


def test_retention_cli_policy_override(tmp_path, capsys):
    pol = tmp_path / "policy.json"
    pol.write_text(json.dumps({"keep_years": 10}), encoding="utf-8")
    assert main(["retention", "--as-of", "2026-10-17", "--policy", str(pol), "--format", "json", str(RECORDS)]) == 0
    data = json.loads(capsys.readouterr().out)
    decisions = {r["id"]: r["decision"] for r in data["results"]}
    assert decisions["rec-002"] == "KEEP" and decisions["rec-004"] == "DELETE"


def test_report_cli_writes_file(tmp_path):
    out = tmp_path / "record.md"
    rc = main(["report", str(ATMIYATA), "--records", str(RECORDS), "--as-of", "2026-10-17",
               "--date", "2026-10-17", "-o", str(out)])
    assert rc == 0
    text = out.read_text(encoding="utf-8")
    assert text.startswith("# DRAFT – needs owner decision")
