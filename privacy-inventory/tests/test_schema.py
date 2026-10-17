"""inventory.schema.json describes stores and fields; the stdlib validator enforces it."""
import json

from conftest import ALL_INVENTORIES, ROOT, load, minimal_field, minimal_inventory
from privacy_inventory.schema import load_schema, validate

CLASSIFICATIONS = {
    "direct_identifier", "contact", "quasi_identifier", "free_text",
    "sensitive_design", "pseudonymous", "aggregate",
}


def test_schema_is_valid_json_and_lists_all_classifications():
    schema = json.loads((ROOT / "inventory.schema.json").read_text(encoding="utf-8"))
    field = schema["$defs"]["field"]["properties"]
    assert set(field["classification"]["enum"]) == CLASSIFICATIONS
    assert set(field["visibility"]["enum"]) - {None} == {"private", "team", "public"}
    for key in ("purpose", "consent_basis", "retention", "deletion_path", "steward_role",
                "processor_location", "export_eligible", "moderation", "content_kind"):
        assert key in field, key


def test_every_fixture_validates_against_schema():
    schema = load_schema()
    for path in ALL_INVENTORIES:
        assert validate(load(path), schema) == [], path.name


def test_unknown_classification_is_rejected():
    inv = minimal_inventory(minimal_field(classification="secret_sauce"))
    errors = validate(inv, load_schema())
    assert any("classification" in p for p, _ in errors)


def test_unknown_key_and_missing_required_are_rejected():
    inv = minimal_inventory(minimal_field(colour="blue"))
    del inv["domestic_jurisdiction"]
    paths = [p for p, _ in validate(inv, load_schema())]
    assert any("colour" in p for p in paths)
    assert any("domestic_jurisdiction" in p for p in paths)
