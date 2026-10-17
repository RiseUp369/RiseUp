"""Shared fixtures. Every test runs with outbound sockets blocked (no network)."""
from __future__ import annotations

import json
import socket
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "fixtures"
ATMIYATA = FIXTURES / "atmiyata-prototype.synthetic.json"
POLL = FIXTURES / "anonymous-poll.synthetic.json"
TRACKER = FIXTURES / "volunteer-tracker.synthetic.json"
RECORDS = FIXTURES / "records.synthetic.json"
ALL_INVENTORIES = [ATMIYATA, POLL, TRACKER]


class _NoNetwork(socket.socket):
    def connect(self, *args, **kwargs):  # pragma: no cover - only hit on a bug
        raise AssertionError("network access attempted during tests")

    def connect_ex(self, *args, **kwargs):  # pragma: no cover
        raise AssertionError("network access attempted during tests")


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    monkeypatch.setattr(socket, "socket", _NoNetwork)
    monkeypatch.setattr(
        socket,
        "create_connection",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("network access attempted")),
    )


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def minimal_field(**overrides) -> dict:
    """A fully governed field; tests remove or change one key at a time."""
    field = {
        "name": "sample_field",
        "classification": "pseudonymous",
        "purpose": "a stated purpose",
        "consent_basis": "consent_notice",
        "visibility": "private",
        "retention": "keep-1y",
        "deletion_path": "deletion request removes the row",
        "steward_role": "data steward",
        "content_kind": "reference",
        "export_eligible": False,
    }
    field.update(overrides)
    return {k: v for k, v in field.items() if v is not _DROP}


class _Drop:
    pass


_DROP = _Drop()
DROP = _DROP


def minimal_inventory(*fields: dict, processor_location: str = "home", disclosed=()) -> dict:
    return {
        "inventory_version": "1",
        "system": "unit-test inventory",
        "domestic_jurisdiction": "home",
        "consent": {"notice_ref": "notice v1", "disclosed_processor_locations": list(disclosed)},
        "retention_rules": {"keep-1y": {"description": "one year", "keep_years": 1, "then": "delete"}},
        "stores": [
            {
                "id": "store_a",
                "processor": {"kind": "self_hosted", "location": processor_location},
                "fields": list(fields) or [minimal_field()],
            }
        ],
    }
