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
IMAGE_EXTENSIONS = {".webp"}
PUBLIC_FILES = {".nojekyll"}
EXPECTED_RECORD_KEYS = {"id", "title", "subject", "grades", "path", "summary", "tags"}
EXPECTED_TAG_KEYS = {"id", "label", "group"}
GROUPS = ("purpose", "topic", "format")
GROUP_RANK = {group: index for index, group in enumerate(GROUPS)}
LEGACY_PATH_GRADE_BY_ACTIVITY_ID = {"grade5-lighthouse": 5, "grade4-lighthouse": 5}


def is_allowed_public_file(path: Path) -> bool:
    return path.suffix.lower() in TEXT_EXTENSIONS | IMAGE_EXTENSIONS or path.name in PUBLIC_FILES


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


def validate_manifest_data(data: object, *, check_paths: bool = True, root: Path = ROOT) -> list[str]:
    """Return all structural and semantic V2 manifest findings."""
    findings: list[str] = []
    if not isinstance(data, dict) or set(data) != {"schemaVersion", "tags", "activities"}:
        return ["envelope keys must be exactly schemaVersion, tags, and activities"]
    if data.get("schemaVersion") != 2:
        findings.append("schemaVersion must equal 2")
    registry = data.get("tags")
    records = data.get("activities")
    if not isinstance(registry, list) or not registry:
        findings.append("tags must be a non-empty array")
        registry = []
    if not isinstance(records, list):
        findings.append("activities must be an array")
        records = []

    tag_ids: list[str] = []
    seen_labels: set[tuple[str, str]] = set()
    for index, tag in enumerate(registry):
        label = f"tags[{index}]"
        if not isinstance(tag, dict) or set(tag) != EXPECTED_TAG_KEYS:
            findings.append(f"{label}: keys do not match V2 tag contract")
            continue
        tag_id, text, group = tag.get("id"), tag.get("label"), tag.get("group")
        if not isinstance(tag_id, str) or not (1 <= len(tag_id) <= 64) or not ID_RE.fullmatch(tag_id):
            findings.append(f"{label}: invalid id")
            continue
        if not isinstance(text, str) or not (1 <= len(text) <= 40) or text != text.strip() or CONTROL_RE.search(text):
            findings.append(f"{label}: invalid label")
        if group not in GROUPS:
            findings.append(f"{label}: invalid group")
        if tag_id in tag_ids:
            findings.append(f"{label}: duplicate tag id")
        if isinstance(text, str) and isinstance(group, str) and (group, text) in seen_labels:
            findings.append(f"{label}: duplicate group/label")
        tag_ids.append(tag_id)
        seen_labels.add((str(group), str(text)))
    valid_tag_ids = set(tag_ids)
    order_keys = [(GROUP_RANK.get(tag.get("group"), 99), str(tag.get("id", ""))) for tag in registry if isinstance(tag, dict)]
    if order_keys != sorted(order_keys):
        findings.append("tag registry is not in group/id order")

    ids: set[str] = set()
    paths: set[str] = set()
    used_tags: set[str] = set()
    sort_keys: list[tuple[int, int, str]] = []
    tag_positions = {tag_id: index for index, tag_id in enumerate(tag_ids)}
    for index, record in enumerate(records):
        label = f"activities[{index}]"
        if not isinstance(record, dict) or set(record) != EXPECTED_RECORD_KEYS:
            findings.append(f"{label}: keys do not match V2 activity contract")
            continue
        activity_id = record.get("id")
        title = record.get("title")
        subject = record.get("subject")
        grades = record.get("grades")
        activity_path = record.get("path")
        summary = record.get("summary")
        record_tags = record.get("tags")
        if not isinstance(activity_id, str) or not (1 <= len(activity_id) <= 64) or not ID_RE.fullmatch(activity_id):
            findings.append(f"{label}: invalid id")
        for field, value, maximum in (("title", title, 80), ("summary", summary, 180)):
            if not isinstance(value, str) or not (1 <= len(value) <= maximum) or value != value.strip() or CONTROL_RE.search(value):
                findings.append(f"{label}: invalid {field}")
        if subject not in SUBJECTS:
            findings.append(f"{label}: invalid subject")
        if not isinstance(grades, list) or not (1 <= len(grades) <= 7) or any(type(grade) is not int or not 5 <= grade <= 11 for grade in grades):
            findings.append(f"{label}: grades must be integers from 5 through 11")
        elif grades != sorted(set(grades)):
            findings.append(f"{label}: grades must be unique and ascending")
        if not isinstance(record_tags, list) or not record_tags or any(not isinstance(tag_id, str) for tag_id in record_tags):
            findings.append(f"{label}: tags must be a non-empty string array")
        else:
            if len(record_tags) != len(set(record_tags)):
                findings.append(f"{label}: tags must be unique")
            if any(tag_id not in valid_tag_ids for tag_id in record_tags):
                findings.append(f"{label}: unknown tag")
            positions = [tag_positions.get(tag_id, -1) for tag_id in record_tags]
            if positions != sorted(positions):
                findings.append(f"{label}: tags are not in registry order")
            used_tags.update(record_tags)
        match = PATH_RE.fullmatch(activity_path) if isinstance(activity_path, str) and len(activity_path) <= 160 else None
        if not match:
            findings.append(f"{label}: invalid activity path")
            continue
        path_subject, prefix, slug = match.groups()
        primary_grade = int(prefix)
        if path_subject != subject:
            findings.append(f"{label}: path subject differs from metadata")
        metadata_grade = LEGACY_PATH_GRADE_BY_ACTIVITY_ID.get(str(activity_id), primary_grade)
        if isinstance(grades, list) and metadata_grade not in grades:
            findings.append(f"{label}: primary grade is absent from grades")
        if slug != activity_id:
            findings.append(f"{label}: directory slug differs from id")
        if activity_id in ids:
            findings.append(f"{label}: duplicate activity id")
        if activity_path in paths:
            findings.append(f"{label}: duplicate activity path")
        ids.add(str(activity_id))
        paths.add(str(activity_path))
        if check_paths and not (root / str(activity_path) / "index.html").is_file():
            findings.append(f"{label}: target index.html is missing")
        if subject in SUBJECT_RANK:
            sort_keys.append((SUBJECT_RANK[subject], primary_grade, str(activity_id)))
    if sort_keys != sorted(sort_keys):
        findings.append("activities are not in deterministic order")
    unused = valid_tag_ids - used_tags
    if unused:
        findings.append(f"unused registry tags: {', '.join(sorted(unused))}")
    if check_paths:
        actual = {
            str(path.parent.relative_to(root)).replace("\\", "/") + "/"
            for path in root.glob("activities/*/[0-9][0-9]-*/index.html")
        }
        for path in sorted(actual - paths):
            findings.append(f"orphan activity directory: {path}")
        for path in sorted(paths - actual):
            findings.append(f"manifest target absent from activity tree: {path}")
    return findings


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
        path = ROOT / "activities-v2.json"
        try:
            self.manifest = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_object)
        except (OSError, UnicodeError, json.JSONDecodeError, DuplicateKeyError) as exc:
            self.error("manifest", path, type(exc).__name__)
            return
        self.counts["manifest_files"] = 1

    def validate_manifest(self) -> None:
        for finding in validate_manifest_data(self.manifest, root=ROOT):
            self.error("schema", "activities-v2.json", finding)
        records = self.manifest.get("activities", []) if isinstance(self.manifest, dict) else []
        self.counts["activity_records"] = len(records) if isinstance(records, list) else 0
        self.counts["activity_directories"] = sum(1 for _ in ROOT.glob("activities/*/[0-9][0-9]-*/index.html"))

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
            if not is_allowed_public_file(path):
                self.error("public-safety", path, "unexpected public file type")
                continue
            if path.suffix.lower() in IMAGE_EXTENSIONS:
                self.counts["public_files_scanned"] += 1
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
        if [target for _, target in fetches] != ["./activities-v2.json"]:
            self.error("network", "assets/catalog.js", "fetch targets must be exactly ./activities-v2.json")
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
