"""`check` gap rules, one test per rule, plus the three fixtures' expected outcomes."""
from conftest import ATMIYATA, DROP, POLL, TRACKER, load, minimal_field, minimal_inventory
from privacy_inventory.checks import ERROR, REVIEW_REQUIRED, WARNING, check_inventory, exit_code


def codes(findings, severity=None):
    return {f.code for f in findings if severity is None or f.severity == severity}


def find(findings, code):
    return [f for f in findings if f.code == code]


def test_fully_governed_field_is_clean():
    assert check_inventory(minimal_inventory()) == []


def test_missing_purpose_consent_retention_deletion_are_errors():
    inv = minimal_inventory(minimal_field(purpose=DROP, consent_basis=None, retention=DROP, deletion_path=""))
    got = codes(check_inventory(inv), ERROR)
    assert {"MISSING_PURPOSE", "MISSING_CONSENT_BASIS", "MISSING_RETENTION", "MISSING_DELETION_PATH"} <= got


def test_consent_basis_none_counts_as_missing():
    inv = minimal_inventory(minimal_field(consent_basis="none"))
    assert "MISSING_CONSENT_BASIS" in codes(check_inventory(inv), ERROR)


def test_unknown_retention_rule_is_error():
    inv = minimal_inventory(minimal_field(retention="forever-ish"))
    assert "UNKNOWN_RETENTION_RULE" in codes(check_inventory(inv), ERROR)


def test_identifier_with_public_visibility_is_error():
    for cls in ("direct_identifier", "contact", "quasi_identifier"):
        inv = minimal_inventory(minimal_field(classification=cls, visibility="public"))
        assert "IDENTIFIER_PUBLIC" in codes(check_inventory(inv), ERROR), cls
    ok = minimal_inventory(minimal_field(classification="aggregate", visibility="public"))
    assert "IDENTIFIER_PUBLIC" not in codes(check_inventory(ok))


def test_free_text_needs_retention_and_moderation():
    inv = minimal_inventory(minimal_field(classification="free_text", retention=DROP))
    got = codes(check_inventory(inv), ERROR)
    assert {"FREE_TEXT_NO_RETENTION", "FREE_TEXT_NO_MODERATION"} <= got
    moderated = minimal_inventory(minimal_field(classification="free_text", moderation="pre_publish_review"))
    assert not codes(check_inventory(moderated)) & {"FREE_TEXT_NO_RETENTION", "FREE_TEXT_NO_MODERATION"}


def test_raw_access_code_is_error_and_hashed_is_fine():
    raw = minimal_inventory(minimal_field(name="entry_code", secret={"kind": "access_code", "storage": "raw"}))
    assert "RAW_SECRET_STORED" in codes(check_inventory(raw), ERROR)
    hashed = minimal_inventory(minimal_field(name="entry_code", secret={"kind": "access_code", "storage": "hashed"}))
    assert codes(check_inventory(hashed)) == set()


def test_secret_looking_field_without_declaration_is_flagged():
    inv = minimal_inventory(minimal_field(name="access_code"))
    assert "UNDECLARED_SECRET_LIKE_FIELD" in codes(check_inventory(inv), ERROR)


def test_sensitive_design_is_review_required():
    inv = minimal_inventory(minimal_field(classification="sensitive_design"))
    findings = check_inventory(inv)
    assert codes(findings, REVIEW_REQUIRED) == {"SENSITIVE_DESIGN"}
    assert exit_code(findings) == 3


def test_non_domestic_processor_must_be_disclosed():
    undisclosed = minimal_inventory(processor_location="US")
    assert "PROCESSOR_NOT_DISCLOSED" in codes(check_inventory(undisclosed), ERROR)
    disclosed = minimal_inventory(processor_location="US", disclosed=["US"])
    assert "PROCESSOR_NOT_DISCLOSED" not in codes(check_inventory(disclosed))
    field_override = minimal_inventory(minimal_field(processor_location="EU"), disclosed=["US"])
    assert "PROCESSOR_NOT_DISCLOSED" in codes(check_inventory(field_override), ERROR)


def test_export_of_raw_operations_commitments_private_context_is_error():
    for kind in ("raw_operations", "commitment", "private_context"):
        inv = minimal_inventory(minimal_field(export_eligible=True, content_kind=kind))
        assert "EXPORT_NOT_REVIEWED_LEARNING" in codes(check_inventory(inv), ERROR), kind
    ok = minimal_inventory(minimal_field(export_eligible=True, content_kind="reviewed_learning",
                                         classification="aggregate"))
    assert codes(check_inventory(ok)) == set()


def test_export_of_identifier_is_error():
    inv = minimal_inventory(minimal_field(export_eligible=True, content_kind="reviewed_learning",
                                          classification="contact"))
    assert "EXPORT_IDENTIFIER" in codes(check_inventory(inv), ERROR)


def test_unassigned_steward_for_outside_service_needs_owner_decision():
    inv = minimal_inventory(minimal_field(steward_role="unassigned"), processor_location="US", disclosed=["US"])
    inv["stores"][0]["processor"]["outside_service"] = True
    assert "STEWARD_UNASSIGNED" in codes(check_inventory(inv), REVIEW_REQUIRED)


def test_store_steward_role_is_inherited_by_fields():
    inv = minimal_inventory(minimal_field(steward_role=DROP))
    assert "MISSING_STEWARD_ROLE" in codes(check_inventory(inv), ERROR)
    inv["stores"][0]["steward_role"] = "data steward"
    assert codes(check_inventory(inv)) == set()


def test_atmiyata_fixture_reports_the_three_headline_gaps():
    findings = check_inventory(load(ATMIYATA), source="atmiyata.json")
    assert exit_code(findings) == 1
    paths = {(f.code, f.path) for f in findings}
    assert ("FREE_TEXT_NO_RETENTION", "stores/reflections/fields/reflection_text/retention") in paths
    assert ("FREE_TEXT_NO_MODERATION", "stores/reflections/fields/reflection_text/moderation") in paths
    assert ("MISSING_CONSENT_BASIS", "stores/phone_lookup/fields/phone_number/consent_basis") in paths
    sensitive = find(findings, "SENSITIVE_DESIGN")
    assert [f.path for f in sensitive] == ["stores/connection_log/fields/matching_pool"]
    assert sensitive[0].severity == REVIEW_REQUIRED
    assert all(f.source == "atmiyata.json" for f in findings)


def test_anonymous_poll_fixture_has_zero_errors():
    findings = check_inventory(load(POLL))
    assert [f for f in findings if f.severity == ERROR] == []
    assert exit_code(findings) == 0


def test_volunteer_tracker_fixture_flags_commitment_export_only():
    findings = check_inventory(load(TRACKER))
    errors = [f for f in findings if f.severity == ERROR]
    assert {f.path for f in errors} == {"stores/work_log/fields/commitment/export_eligible"}
    assert {f.code for f in errors} == {"EXPORT_NOT_REVIEWED_LEARNING", "EXPORT_IDENTIFIER"}
    assert not [f for f in findings if f.severity == WARNING]
