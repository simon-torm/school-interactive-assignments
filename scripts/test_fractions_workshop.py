#!/usr/bin/env python3
"""Deterministic content and static-contract checks for Fractions Workshop."""

from __future__ import annotations

import json
import re
import subprocess
from fractions import Fraction
from html import unescape
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTIVITY = ROOT / "activities/math/05-fractions-workshop/index.html"


class Links(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.catalog: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "a" and "catalog-link" in (values.get("class") or "").split():
            self.catalog.append(values.get("href") or "")


def visible(value: str) -> str:
    value = re.sub(
        r'<span class="fraction [^"]*" role="math" aria-label="(\d+) поділити на (\d+)">.*?</span></span>',
        lambda match: f"{match.group(1)}/{match.group(2)}",
        value,
    )
    return " ".join(unescape(re.sub(r"<[^>]+>", " ", value)).split())


def main() -> None:
    html = ACTIVITY.read_text(encoding="utf-8")
    parser = Links()
    parser.feed(html)
    assert parser.catalog == ["../../../"], "activity must expose exactly one catalog return link"
    assert "<form" not in html.lower(), "public activity must not contain a form"
    assert not re.search(r"https?://|(?:href|src)=[\"']//", html), "activity must not load remote resources"

    script_match = re.search(r"<script>\n(.*?)\n</script>", html, re.S)
    assert script_match, "inline lesson script is missing"
    script = script_match.group(1)
    subprocess.run(["node", "--check"], input=script, text=True, check=True, capture_output=True)

    prelude = script.split("let state=loadState();", 1)[0]
    probe = prelude + "\nconsole.log(JSON.stringify({comparisonTasks,arithmeticTasks,quizQuestions}));\n"
    result = subprocess.run(["node"], input=probe, text=True, check=True, capture_output=True)
    data = json.loads(result.stdout)

    for task in data["comparisonTasks"]:
        left = Fraction(*task["a"])
        right = Fraction(*task["b"])
        expected = "<" if left < right else ">" if left > right else "="
        assert task["sign"] == expected
        assert task["hint"].strip() and task["explain"].strip()

    for task in data["arithmeticTasks"]:
        expected = task["a"] + task["b"] if task["op"] == "+" else task["a"] - task["b"]
        assert task["n"] == expected
        assert task["d"] > 0 and task["n"] >= 0 and task["explain"].strip()

    expected_answers = ["3/8", "На скільки рівних частин поділили ціле", "3/6", "<", "2/3", "1 3/4", "7/10", "3/6"]
    assert len(data["quizQuestions"]) == len(expected_answers) == 8
    for question, expected in zip(data["quizQuestions"], expected_answers):
        options = [visible(option) for option in question["options"]]
        assert len(options) == len(set(options)), f"duplicate distractor: {question['q']}"
        assert options[question["correct"]] == expected, (question["q"], options)
        assert question["explain"].strip()

    required_logic = [
        "if(n*t.d===t.n*d)",
        "if(s.compareSolved.length!==4)",
        "if(s.pizzaD!==4||s.pizzaSelected.length!==3)",
        "if(s.lineN!==7)",
        "if(!s.equivalentSolved)",
        "if(s.arithSolved.length!==2)",
        "if(s.quizAnswers.some(v=>v===null))",
        "state.quizAttempts[i]++",
        "state.quizAnswers=Array(8).fill(null)",
        "if(action==='confirm-reset'){",
        "if(action==='print'){",
    ]
    for snippet in required_logic:
        assert snippet in script, f"missing learner-path logic: {snippet}"

    print("PASS: Fractions Workshop math, distractors, hints, script, persistence, reset, print, and public boundary")


if __name__ == "__main__":
    main()
