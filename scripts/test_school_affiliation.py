#!/usr/bin/env python3
"""Verify the root catalog's narrowly approved school affiliation."""

from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SCHOOL_URL = "https://sophiaschool.ck.ua"
SCHOOL_LABEL = "Приватна школа «Софія»"
FOOTER_TEXT = "Творчу лабораторію створено вчителем приватної школи «Софія»."
PROHIBITED_CLAIMS = (
    "проєкт школи",
    "офіційний проєкт",
    "за підтримки школи",
)


class CatalogParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.anchors: list[dict[str, object]] = []
        self.images: list[dict[str, str]] = []
        self.paragraphs: list[dict[str, object]] = []
        self._anchor: dict[str, object] | None = None
        self._paragraph: dict[str, object] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {name: value or "" for name, value in attrs}
        if tag == "a":
            self._anchor = {"attrs": values, "text": ""}
        elif tag == "img":
            self.images.append(values)
        elif tag == "p":
            self._paragraph = {"attrs": values, "text": ""}

    def handle_data(self, data: str) -> None:
        if self._anchor is not None:
            self._anchor["text"] = str(self._anchor["text"]) + data
        if self._paragraph is not None:
            self._paragraph["text"] = str(self._paragraph["text"]) + data

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._anchor is not None:
            self.anchors.append(self._anchor)
            self._anchor = None
        elif tag == "p" and self._paragraph is not None:
            self.paragraphs.append(self._paragraph)
            self._paragraph = None


def normalized(text: object) -> str:
    return " ".join(str(text).split())


def main() -> None:
    html_path = ROOT / "index.html"
    html = html_path.read_text(encoding="utf-8")
    parser = CatalogParser()
    parser.feed(html)

    school_links = [link for link in parser.anchors if link["attrs"].get("href") == SCHOOL_URL]
    assert len(school_links) == 2, "root catalog must expose exactly the hero and footer school links"
    assert all("target" not in link["attrs"] for link in school_links), "school links must use same-tab navigation"

    badge = next(link for link in school_links if "school-badge" in link["attrs"].get("class", "").split())
    assert normalized(badge["text"]) == f"{SCHOOL_LABEL} Сайт школи ↗"
    assert badge["attrs"].get("aria-label") == "Відвідати сайт Приватної школи «Софія»"

    footer_link = next(link for link in school_links if link is not badge)
    assert normalized(footer_link["text"]) == "приватної школи «Софія»"
    attribution = next(
        paragraph for paragraph in parser.paragraphs
        if "school-attribution" in paragraph["attrs"].get("class", "").split()
    )
    assert normalized(attribution["text"]) == FOOTER_TEXT
    assert "Без реєстрації, реклами та відстеження. Лише навчання." in html

    logo = [image for image in parser.images if image.get("src") == "assets/sofia-school-logo.webp"]
    assert len(logo) == 1, "the hero must use one local school logo"
    assert logo[0].get("alt") == "", "adjacent school text makes the logo decorative"
    assert logo[0].get("width") == "183" and logo[0].get("height") == "183"
    logo_path = ROOT / logo[0]["src"]
    assert logo_path.is_file() and logo_path.read_bytes()[:4] == b"RIFF", "local WebP logo is missing or invalid"
    assert logo_path.stat().st_size < 40_864, "optimized logo must be smaller than the source PNG"

    runtime_paths = [ROOT / "index.html", ROOT / "assets/catalog.css", ROOT / "assets/catalog.js"]
    runtime_text = "\n".join(path.read_text(encoding="utf-8") for path in runtime_paths)
    assert "sophiaschool.ck.ua/wp-content" not in runtime_text, "runtime must not hotlink the source logo"
    external_urls = re.findall(r"https?://[^\s'\"<>]+", runtime_text)
    assert external_urls == [SCHOOL_URL, SCHOOL_URL], "only the two exact school anchors may be external"
    assert all(urlsplit(url).path in ("", "/") for url in external_urls)
    lowered = runtime_text.casefold()
    assert not any(claim in lowered for claim in PROHIBITED_CLAIMS), "catalog must not imply official status or endorsement"

    print("PASS: exact accessible school links, local optimized logo, factual attribution, and privacy boundary")


if __name__ == "__main__":
    main()
