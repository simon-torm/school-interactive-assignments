#!/usr/bin/env python3
"""Standard-library contract tests for the V2 activity manifest."""

from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("validate_catalog", ROOT / "scripts" / "validate_catalog.py")
assert SPEC and SPEC.loader
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


def valid_manifest() -> dict[str, object]:
    return {
        "schemaVersion": 2,
        "tags": [
            {"id": "review", "label": "Повторення", "group": "purpose"},
            {"id": "fractions", "label": "Звичайні дроби", "group": "topic"},
            {"id": "game", "label": "Гра", "group": "format"},
        ],
        "activities": [
            {
                "id": "fraction-kingdom",
                "title": "Королівство дробів",
                "subject": "math",
                "grades": [5, 6],
                "path": "activities/math/06-fraction-kingdom/",
                "summary": "Шість інтерактивних рівнів про дроби.",
                "tags": ["fractions", "game"],
            },
            {
                "id": "grade5-lighthouse",
                "title": "Маяк п’ятого класу",
                "subject": "math",
                "grades": [6],
                "path": "activities/math/06-grade5-lighthouse/",
                "summary": "Експедиція-повторення математики 5 класу.",
                "tags": ["review", "fractions", "game"],
            },
        ],
    }


def errors(data: object) -> list[str]:
    return module.validate_manifest_data(data, check_paths=False)


def expect_invalid(name: str, mutate) -> None:
    data = copy.deepcopy(valid_manifest())
    mutate(data)
    found = errors(data)
    assert found, f"{name}: expected invalid fixture"


def main() -> None:
    assert errors(valid_manifest()) == []
    expect_invalid("V1 envelope", lambda d: d.__setitem__("schemaVersion", 1))
    expect_invalid("extra envelope key", lambda d: d.__setitem__("extra", True))
    expect_invalid("missing tags registry", lambda d: d.pop("tags"))
    expect_invalid("wrong group", lambda d: d["tags"][0].__setitem__("group", "audience"))
    expect_invalid("untrimmed label", lambda d: d["tags"][0].__setitem__("label", " Повторення"))
    expect_invalid("duplicate id", lambda d: d["tags"][1].__setitem__("id", "review"))
    def duplicate_group_label(data: dict[str, object]) -> None:
        data["tags"][1]["group"] = "purpose"
        data["tags"][1]["label"] = "Повторення"
    expect_invalid("duplicate group label", duplicate_group_label)
    expect_invalid("registry order", lambda d: d["tags"].reverse())
    expect_invalid("unused registry tag", lambda d: d["tags"].insert(2, {"id": "geometry", "label": "Геометрія", "group": "topic"}))
    expect_invalid("missing record tags", lambda d: d["activities"][0].pop("tags"))
    expect_invalid("empty record tags", lambda d: d["activities"][0].__setitem__("tags", []))
    expect_invalid("unknown record tag", lambda d: d["activities"][0]["tags"].append("unknown"))
    expect_invalid("duplicate record tag", lambda d: d["activities"][0]["tags"].append("game"))
    expect_invalid("record tag order", lambda d: d["activities"][0]["tags"].reverse())
    expect_invalid("activity order", lambda d: d["activities"].reverse())
    expect_invalid("bad path subject", lambda d: d["activities"][0].__setitem__("path", "activities/computer-science/06-fraction-kingdom/"))
    expect_invalid("bad grade", lambda d: d["activities"][0].__setitem__("grades", [6, 5]))
    json.dumps(valid_manifest(), ensure_ascii=False)
    print("PASS: V2 manifest positive and negative fixtures")


if __name__ == "__main__":
    main()
