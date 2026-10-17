"""A small JSON Schema subset validator (standard library only).

Supports: type (incl. lists and null), required, properties, additionalProperties
(bool or schema), items, enum, pattern, minLength, minItems and local $ref.
That is all inventory.schema.json uses.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "inventory.schema.json"

_TYPES = {
    "object": dict,
    "array": list,
    "string": str,
    "boolean": bool,
    "null": type(None),
}


def load_schema(path: Path = SCHEMA_PATH) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _type_ok(value, name: str) -> bool:
    if name == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if name == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    return isinstance(value, _TYPES[name])


def _resolve(ref: str, root: dict) -> dict:
    if not ref.startswith("#/"):
        raise ValueError(f"only local $ref supported: {ref}")
    node = root
    for part in ref[2:].split("/"):
        node = node[part]
    return node


def validate(instance, schema: dict, root: dict | None = None, path: str = "") -> list[tuple[str, str]]:
    """Return a list of (path, message); empty means valid."""
    root = root if root is not None else schema
    if "$ref" in schema:
        return validate(instance, _resolve(schema["$ref"], root), root, path)
    errors: list[tuple[str, str]] = []
    where = path or "(root)"
    if "type" in schema:
        types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_type_ok(instance, t) for t in types):
            return [(where, f"expected type {'/'.join(types)}, got {type(instance).__name__}")]
    if "enum" in schema and instance not in schema["enum"]:
        allowed = ", ".join("null" if v is None else str(v) for v in schema["enum"])
        errors.append((where, f"value {instance!r} not one of: {allowed}"))
    if isinstance(instance, str):
        if len(instance) < schema.get("minLength", 0):
            errors.append((where, "string is too short"))
        if "pattern" in schema and not re.search(schema["pattern"], instance):
            errors.append((where, f"does not match pattern {schema['pattern']}"))
    if isinstance(instance, list):
        if len(instance) < schema.get("minItems", 0):
            errors.append((where, f"needs at least {schema['minItems']} item(s)"))
        if "items" in schema:
            for i, item in enumerate(instance):
                errors += validate(item, schema["items"], root, f"{path}[{i}]")
    if isinstance(instance, dict):
        for key in schema.get("required", []):
            if key not in instance:
                errors.append((f"{path}/{key}" if path else key, "required key missing"))
        props = schema.get("properties", {})
        extra = schema.get("additionalProperties", True)
        for key, value in instance.items():
            sub = f"{path}/{key}" if path else key
            if key in props:
                errors += validate(value, props[key], root, sub)
            elif extra is False:
                errors.append((sub, "unknown key"))
            elif isinstance(extra, dict):
                errors += validate(value, extra, root, sub)
    return errors
