"""Steward fields accept role labels only, never names or emails."""
import pytest

from conftest import minimal_field, minimal_inventory
from privacy_inventory.checks import ERROR, check_inventory
from privacy_inventory.steward import role_label_problems


@pytest.mark.parametrize("label", ["data steward", "session lead", "volunteer coordinator", "unassigned",
                                   "event-day steward", "export reviewer (learning)"])
def test_role_labels_are_accepted(label):
    assert role_label_problems(label) == []


def test_email_is_rejected():
    problems = role_label_problems("steward@example.org")
    assert any("@" in p for p in problems)


@pytest.mark.parametrize("label", ["Asha Rao", "lead is Jordan Smith", "Data Steward"])
def test_two_capitalised_words_are_rejected(label):
    assert any("capitalised" in p for p in role_label_problems(label))


def test_phone_number_is_rejected():
    assert role_label_problems("call 555 010 0199")


def test_checker_reports_steward_that_is_not_a_role():
    inv = minimal_inventory(minimal_field(steward_role="Jordan Smith"))
    hits = [f for f in check_inventory(inv) if f.code == "STEWARD_NOT_ROLE"]
    assert hits and hits[0].severity == ERROR
    assert hits[0].path == "stores/store_a/fields/sample_field/steward_role"
    assert "Jordan" not in hits[0].message
    inv = minimal_inventory()
    inv["stores"][0]["steward_role"] = "someone@example.org"
    del inv["stores"][0]["fields"][0]["steward_role"]
    hits = [f for f in check_inventory(inv) if f.code == "STEWARD_NOT_ROLE"]
    assert hits and hits[0].path == "stores/store_a/steward_role"
