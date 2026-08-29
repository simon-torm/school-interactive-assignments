#!/usr/bin/env python3
"""Exercise the production catalog manifest through the real browser runtime."""

from __future__ import annotations

import contextlib
import http.server
import re
import shutil
import socketserver
import subprocess
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHROMIUM = shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")


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
    chooser = rendered_dom()
    assert hidden(chooser, "error-view"), "production manifest must not show catalog error"
    assert not hidden(chooser, "chooser-view"), "production manifest must render subject chooser"
    assert re.search(r'data-count-for="math">3 завдання<', chooser), "real Math activity count must render"

    catalog = rendered_dom("?subject=math&grades=5")
    assert not hidden(catalog, "catalog-view"), "Math catalog must render through URL state"
    assert catalog.count('class="activity-link"') == 3, "grade 5 filter must render all production Math links"
    assert 'href="activities/math/05-catchx/"' in catalog
    assert 'href="activities/math/06-grade5-lighthouse/"' in catalog
    assert 'href="activities/math/06-fraction-kingdom/"' in catalog
    print("PASS: production activities.json loads through the real catalog browser runtime")


if __name__ == "__main__":
    main()
