#!/usr/bin/env python3
"""Validate the static activity catalog using only the Python standard library."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SUBJECTS = ("math", "computer-science")
SUBJECT_RANK = {subject: index for index, subject in enumerate(SUBJECTS)}
ID_RE = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")
PATH_RE = re.compile(r"^activities/(math|computer-science)/(0[5-9]|1[01])-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)/$")
CONTROL_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")
CSS_URL_RE = re.compile(r"url\(\s*(['\"]?)([^)'\"]+)\1\s*\)", re.IGNORECASE)
TEXT_EXTENSIONS = {".html", ".css", ".js", ".json", ".md", ".py", ".txt", ""}
PUBLIC_FILES = {".nojekyll"}
EXPECTED_RECORD_KEYS = {"id", "title", "subject", "grades", "path", "summary"}


class DuplicateKeyError(ValueError):
    pass


def unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise DuplicateKeyError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


class LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.targets: list[tuple[str, str]] = []
        self.forms = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value for key, value in attrs if value is not None}
        if tag.lower() == "form":
            self.forms += 1
        for attribute in ("href", "src"):
            if attribute in values:
                self.targets.append((attribute, values[attribute]))
        if tag.lower() == "meta" and values.get("http-equiv", "").lower() == "refresh":
            match = re.search(r"(?:^|;)\s*url\s*=\s*(.+)\s*$", values.get("content", ""), re.IGNORECASE)
            if match:
                self.targets.append(("refresh", match.group(1).strip(" '\"")))


class Validator:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.counts: Counter[str] = Counter()
        self.manifest: dict[str, object] = {}

    def error(self, category: str, path: Path | str, message: str) -> None:
        display = str(path)
        try:
            display = str(Path(path).relative_to(ROOT))
        except (ValueError, TypeError):
            pass
        self.errors.append(f"[{category}] {display}: {message}")

    def load_manifest(self) -> None:
        path = ROOT / "activities.json"
        try:
            self.manifest = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_object)
        except (OSError, UnicodeError, json.JSONDecodeError, DuplicateKeyError) as exc:
            self.error("manifest", path, type(exc).__name__)
            return
        self.counts["manifest_files"] = 1

    def validate_manifest(self) -> None:
        data = self.manifest
        if not isinstance(data, dict) or set(data) != {"schemaVersion", "activities"}:
            self.error("schema", "activities.json", "envelope keys must be exactly schemaVersion and activities")
            return
        if data.get("schemaVersion") != 1:
            self.error("schema", "activities.json", "schemaVersion must equal 1")
        records = data.get("activities")
        if not isinstance(records, list):
            self.error("schema", "activities.json", "activities must be an array")
            return

        ids: set[str] = set()
        paths: set[str] = set()
        sort_keys: list[tuple[int, int, str]] = []
        for index, record in enumerate(records):
            label = f"activities.json#activities[{index}]"
            if not isinstance(record, dict) or set(record) != EXPECTED_RECORD_KEYS:
                self.error("schema", label, "record keys do not match V1 contract")
                continue
            activity_id = record.get("id")
            title = record.get("title")
            subject = record.get("subject")
            grades = record.get("grades")
            activity_path = record.get("path")
            summary = record.get("summary")

            if not isinstance(activity_id, str) or not (1 <= len(activity_id) <= 64) or not ID_RE.fullmatch(activity_id):
                self.error("schema", label, "invalid id")
            for field, value, maximum in (("title", title, 80), ("summary", summary, 180)):
                if not isinstance(value, str) or not (1 <= len(value) <= maximum) or value != value.strip() or CONTROL_RE.search(value):
                    self.error("schema", label, f"invalid {field}")
            if subject not in SUBJECTS:
                self.error("schema", label, "invalid subject")
            if not isinstance(grades, list) or not (1 <= len(grades) <= 7) or any(type(grade) is not int or not 5 <= grade <= 11 for grade in grades):
                self.error("schema", label, "grades must be integers from 5 through 11")
            elif grades != sorted(set(grades)):
                self.error("semantic", label, "grades must be unique and ascending")

            match = PATH_RE.fullmatch(activity_path) if isinstance(activity_path, str) and len(activity_path) <= 160 else None
            if not match:
                self.error("schema", label, "invalid activity path")
                continue
            path_subject, prefix, slug = match.groups()
            primary_grade = int(prefix)
            if path_subject != subject:
                self.error("semantic", label, "path subject differs from metadata")
            if isinstance(grades, list) and primary_grade not in grades:
                self.error("semantic", label, "primary grade is absent from grades")
            if slug != activity_id:
                self.error("semantic", label, "directory slug differs from id")
            if activity_id in ids:
                self.error("semantic", label, "duplicate id")
            if activity_path in paths:
                self.error("semantic", label, "duplicate path")
            ids.add(activity_id)
            paths.add(activity_path)
            target = (ROOT / activity_path).resolve()
            try:
                target.relative_to(ROOT.resolve())
            except ValueError:
                self.error("path", label, "path escapes repository")
            if not (target / "index.html").is_file():
                self.error("path", label, "target index.html is missing")
            if subject in SUBJECT_RANK:
                sort_keys.append((SUBJECT_RANK[subject], primary_grade, str(activity_id)))

        if sort_keys != sorted(sort_keys):
            self.error("semantic", "activities.json", "records are not in deterministic order")
        self.counts["activity_records"] = len(records)

        actual = {
            str(path.parent.relative_to(ROOT)).replace("\\", "/") + "/"
            for path in ROOT.glob("activities/*/[0-9][0-9]-*/index.html")
        }
        missing_records = actual - paths
        missing_directories = paths - actual
        for path in sorted(missing_records):
            self.error("orphan", path, "activity directory is absent from manifest")
        for path in sorted(missing_directories):
            self.error("orphan", path, "manifest target is absent from activity tree")
        self.counts["activity_directories"] = len(actual)

    @staticmethod
    def iter_public_files() -> list[Path]:
        files: list[Path] = []
        for path in ROOT.rglob("*"):
            if not path.is_file() or ".git" in path.parts:
                continue
            relative = path.relative_to(ROOT)
            if relative.parts[:1] == ("scripts",) and path.name != "validate_catalog.py":
                continue
            files.append(path)
        return sorted(files)

    def check_target(self, source: Path, raw_target: str, kind: str) -> None:
        target = raw_target.strip()
        if not target or target.startswith("#") or target.startswith("data:"):
            return
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc or target.startswith("//") or "\\" in target:
            self.error("network", source, f"{kind} uses a non-local target")
            return
        decoded_path = unquote(parsed.path)
        parts = Path(decoded_path).parts
        if any(part == ".." for part in parts):
            candidate = (source.parent / decoded_path).resolve()
        else:
            candidate = (ROOT / decoded_path.lstrip("/")) if decoded_path.startswith("/") else (source.parent / decoded_path)
            candidate = candidate.resolve()
        try:
            candidate.relative_to(ROOT.resolve())
        except ValueError:
            self.error("link", source, f"{kind} escapes repository")
            return
        if decoded_path.endswith("/"):
            candidate /= "index.html"
        if not candidate.exists():
            self.error("link", source, f"{kind} target is missing")
        else:
            self.counts["local_links"] += 1

    def validate_links(self) -> None:
        for path in self.iter_public_files():
            if path.suffix.lower() == ".html":
                try:
                    text = path.read_text(encoding="utf-8")
                    parser = LinkCollector()
                    parser.feed(text)
                except (OSError, UnicodeError) as exc:
                    self.error("encoding", path, type(exc).__name__)
                    continue
                if parser.forms:
                    self.error("public-safety", path, "form element is prohibited")
                for kind, target in parser.targets:
                    self.check_target(path, target, kind)
                self.counts["html_files"] += 1
            elif path.suffix.lower() == ".css":
                try:
                    text = path.read_text(encoding="utf-8")
                except (OSError, UnicodeError) as exc:
                    self.error("encoding", path, type(exc).__name__)
                    continue
                for match in CSS_URL_RE.finditer(text):
                    self.check_target(path, match.group(2), "css-url")
                self.counts["css_files"] += 1

    def validate_public_safety(self) -> None:
        secret_patterns = {
            "private key material": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
            "credential assignment": re.compile(r"(?i)\b(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*['\"][^'\"]{6,}"),
            "email address": re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"),
            "internal workspace path": re.compile(r"/(?:home|Users)/[^\s'\"<>]+"),
            "internal scope tag": re.compile(r"\[(?:personal|work\.[^\]]+|system\.iris)\]"),
            "unexpected network primitive": re.compile(r"\b(?:WebSocket|EventSource|sendBeacon|XMLHttpRequest)\b"),
            "analytics integration": re.compile(r"(?i)\b(?:google-analytics\.com|googletagmanager\.com|plausible\.io/js|mixpanel\.|segment\.io|amplitude\.)"),
        }
        for path in self.iter_public_files():
            relative = path.relative_to(ROOT)
            if path.name == "AGENTS.md":
                self.error("public-safety", path, "AGENTS.md must not be public")
            if path.suffix.lower() not in TEXT_EXTENSIONS and path.name not in PUBLIC_FILES:
                self.error("public-safety", path, "unexpected public file type")
                continue
            if path.name == ".nojekyll":
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except (OSError, UnicodeError) as exc:
                self.error("encoding", path, type(exc).__name__)
                continue
            for label, pattern in secret_patterns.items():
                if path == ROOT / "scripts/validate_catalog.py" and label == "unexpected network primitive":
                    continue
                if pattern.search(text):
                    self.error("public-safety", relative, label)
            self.counts["public_files_scanned"] += 1

        catalog_js = (ROOT / "assets/catalog.js").read_text(encoding="utf-8")
        fetches = re.findall(r"\bfetch\s*\(\s*(['\"])(.*?)\1", catalog_js)
        if [target for _, target in fetches] != ["./activities.json"]:
            self.error("network", "assets/catalog.js", "fetch targets must be exactly ./activities.json")
        self.counts["approved_fetch_targets"] = len(fetches)

    def run(self) -> int:
        self.load_manifest()
        if self.manifest:
            self.validate_manifest()
        self.validate_links()
        self.validate_public_safety()
        for key in (
            "manifest_files", "activity_records", "activity_directories", "html_files",
            "css_files", "local_links", "public_files_scanned", "approved_fetch_targets"
        ):
            print(f"{key}: {self.counts[key]}")
        print(f"findings: {len(self.errors)}")
        for error in self.errors:
            print(error)
        if self.errors:
            return 1
        print("PASS: catalog, paths, links, network boundary, and public-safety checks")
        return 0


if __name__ == "__main__":
    sys.exit(Validator().run())
