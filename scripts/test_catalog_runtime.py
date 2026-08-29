#!/usr/bin/env python3
"""Exercise the production catalog manifest through the real browser runtime."""

from __future__ import annotations

import contextlib
import http.server
import json
import re
import shutil
import socketserver
import subprocess
import tempfile
import threading
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]
CHROMIUM = shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")


class CatalogLinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[dict[str, str]] = []
        self._current: dict[str, str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {name: value or "" for name, value in attrs}
        if tag == "a" and "catalog-link" in values.get("class", "").split():
            self._current = {"href": values.get("href", ""), "text": ""}

    def handle_data(self, data: str) -> None:
        if self._current is not None:
            self._current["text"] += data

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._current is not None:
            self.links.append(self._current)
            self._current = None


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        pass


def rendered_dom(query: str = "") -> str:
    if not CHROMIUM:
        raise AssertionError("Chromium is required for the production catalog runtime test")
    handler = lambda *args, **kwargs: QuietHandler(*args, directory=str(ROOT), **kwargs)
    with socketserver.TCPServer(("127.0.0.1", 0), handler) as server, tempfile.TemporaryDirectory() as profile:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = f"http://127.0.0.1:{server.server_address[1]}/{query}"
            result = subprocess.run(
                [
                    CHROMIUM,
                    "--headless=new",
                    "--no-sandbox",
                    "--disable-gpu",
                    "--disable-background-networking",
                    f"--user-data-dir={profile}",
                    "--virtual-time-budget=2500",
                    "--dump-dom",
                    url,
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=20,
            )
            return result.stdout
        finally:
            server.shutdown()
            thread.join(timeout=2)


def hidden(dom: str, element_id: str) -> bool:
    match = re.search(rf'<[^>]+id="{re.escape(element_id)}"[^>]*>', dom)
    assert match, f"missing #{element_id}"
    return " hidden" in match.group(0)


def main() -> None:
    manifest = json.loads((ROOT / "activities.json").read_text(encoding="utf-8"))
    activities = manifest["activities"]
    assert activities, "canonical catalog must contain at least one activity"
    for activity in activities:
        activity_path = Path(activity["path"])
        parser = CatalogLinkCollector()
        parser.feed((ROOT / activity_path / "index.html").read_text(encoding="utf-8"))
        assert len(parser.links) == 1, f"{activity['id']}: expected exactly one catalog link"
        link = parser.links[0]
        assert link["href"] == "../" * len(activity_path.parts), f"{activity['id']}: catalog root path"
        assert " ".join(link["text"].replace("←", "").split()) == "До каталогу", f"{activity['id']}: catalog label"

    chooser = rendered_dom()
    assert hidden(chooser, "error-view"), "production manifest must not show catalog error"
    assert not hidden(chooser, "chooser-view"), "production manifest must render subject chooser"
    assert re.search(r'data-count-for="math">4 завдання<', chooser), "real Math activity count must render"

    catalog = rendered_dom("?subject=math&grades=5")
    assert not hidden(catalog, "catalog-view"), "Math catalog must render through URL state"
    assert catalog.count('class="activity-link"') == 4, "grade 5 filter must render all production Math links"
    assert 'href="activities/math/05-catchx/"' in catalog
    assert 'href="activities/math/06-grade5-lighthouse/"' in catalog
    assert 'href="activities/math/06-fraction-kingdom/"' in catalog
    assert 'href="activities/math/07-grade4-lighthouse/"' in catalog
    print(f"PASS: {len(activities)} canonical activities expose one catalog return link and render through the real browser runtime")


if __name__ == "__main__":
    main()
