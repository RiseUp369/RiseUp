"""Command line: python -m privacy_inventory {check,retention,report} ...

Exit codes: 0 clean (warnings allowed); 1 errors found; 2 unreadable input or bad
arguments; 3 no errors but REVIEW_REQUIRED items wait for the owner.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

from privacy_inventory.checks import check_inventory, counts, exit_code
from privacy_inventory.report import render_report
from privacy_inventory.retention import evaluate, make_policy


class InputError(Exception):
    pass


def _load_json(path: str) -> dict:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except OSError as exc:
        raise InputError(f"cannot read {path}: {exc.strerror}") from exc
    except json.JSONDecodeError as exc:
        raise InputError(f"{path} is not valid JSON (line {exc.lineno})") from exc


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise InputError(f"date must be YYYY-MM-DD, got {value!r}") from exc


def _records(path: str) -> list[dict]:
    data = _load_json(path)
    records = data.get("records") if isinstance(data, dict) else data
    if not isinstance(records, list):
        raise InputError(f"{path} must be a list of records or an object with a 'records' list")
    return records


def _policy(path: str | None) -> dict:
    return make_policy(_load_json(path) if path else None)


def cmd_check(args) -> int:
    inv = _load_json(args.inventory)
    findings = check_inventory(inv, source=args.inventory)
    c = counts(findings)
    if args.format == "json":
        print(json.dumps({"source": args.inventory, "counts": c,
                          "findings": [f.to_dict() for f in findings]}, indent=2))
    else:
        for f in findings:
            print(f"{f.severity:<15} {f.code:<30} {f.path}\n{'':<16}{f.message}")
        print(f"\n{args.inventory}: {c['ERROR']} error(s), {c['REVIEW_REQUIRED']} review-required, "
              f"{c['WARNING']} warning(s)")
    return exit_code(findings)


def cmd_retention(args) -> int:
    as_of = _parse_date(args.as_of)
    policy = _policy(args.policy)
    results = evaluate(_records(args.records), as_of, policy)
    if args.format == "json":
        print(json.dumps({"policy": policy["label"], "as_of": as_of.isoformat(), "results": results}, indent=2))
    else:
        print(f"policy: {policy['label']}\nas of: {as_of.isoformat()}\n")
        for r in results:
            print(f"{r['id']:<20} {r['decision']:<18} {r['reason']}")
            if r.get("summary") is not None:
                print(f"{'':<20} keep: {', '.join(r['summary'])}; drop: {', '.join(r['drop_fields']) or '-'}")
    return 0


def cmd_report(args) -> int:
    inv = _load_json(args.inventory)
    findings = check_inventory(inv, source=args.inventory)
    results, policy_label = None, make_policy()["label"]
    if args.records:
        if not args.as_of:
            raise InputError("--records needs --as-of YYYY-MM-DD")
        policy = _policy(args.policy)
        policy_label = policy["label"]
        results = evaluate(_records(args.records), _parse_date(args.as_of), policy)
    generated = _parse_date(args.date).isoformat() if args.date else date.today().isoformat()
    text = render_report(inv, findings, source=args.inventory, generated_on=generated,
                         retention_results=results, as_of=args.as_of, policy_label=policy_label)
    if args.output:
        Path(args.output).write_text(text, encoding="utf-8")
        print(f"wrote {args.output}")
    else:
        sys.stdout.write(text)
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="privacy_inventory", description=__doc__.splitlines()[0])
    sub = p.add_subparsers(dest="command", required=True)

    c = sub.add_parser("check", help="flag governance gaps in an inventory")
    c.add_argument("inventory")
    c.add_argument("--format", choices=["text", "json"], default="text")
    c.set_defaults(func=cmd_check)

    r = sub.add_parser("retention", help="KEEP / REDUCE_TO_SUMMARY / DELETE per record")
    r.add_argument("--as-of", required=True, help="YYYY-MM-DD")
    r.add_argument("--policy", help="JSON file overriding the RD-49 option B defaults")
    r.add_argument("--format", choices=["text", "json"], default="text")
    r.add_argument("records")
    r.set_defaults(func=cmd_retention)

    m = sub.add_parser("report", help="write a DRAFT Markdown governance record")
    m.add_argument("inventory")
    m.add_argument("--records")
    m.add_argument("--as-of")
    m.add_argument("--policy")
    m.add_argument("--date", help="generated-on date, YYYY-MM-DD (default: today)")
    m.add_argument("-o", "--output", help="write here instead of stdout")
    m.set_defaults(func=cmd_report)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except InputError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
