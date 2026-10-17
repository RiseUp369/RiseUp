"""Steward fields hold a ROLE label, never a person. Only the owner names people."""
from __future__ import annotations

import re

TWO_CAPITALISED_WORDS = re.compile(r"\b[A-Z][a-z]+[ \t]+[A-Z][a-z]+\b")
EMAIL_OR_HANDLE = re.compile(r"@")
PHONE_LIKE = re.compile(r"\+?\d[\d\s().-]{6,}\d")
ROLE_SHAPE = re.compile(r"^[a-z][a-z0-9 ()/_-]{1,79}$")

UNASSIGNED = {"unassigned", "tbd", "to be assigned"}


def role_label_problems(label) -> list[str]:
    """Return why `label` is not an acceptable role label (empty list = acceptable).

    Messages never echo the label, so a name that slipped in is not repeated.
    """
    if not isinstance(label, str) or not label.strip():
        return ["steward role is empty"]
    problems = []
    if EMAIL_OR_HANDLE.search(label):
        problems.append("contains '@' (looks like an email or handle, not a role)")
    if TWO_CAPITALISED_WORDS.search(label):
        problems.append("contains two capitalised words in a row (looks like a person's name, not a role)")
    if PHONE_LIKE.search(label):
        problems.append("contains a phone-number-like sequence")
    if not problems and not ROLE_SHAPE.match(label):
        problems.append("role labels are lower-case words, e.g. 'data steward' or 'session lead'")
    return problems


def is_unassigned(label) -> bool:
    return isinstance(label, str) and label.strip().lower() in UNASSIGNED
