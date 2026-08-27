# Interactive School Assignments

A dependency-free catalog of privacy-first browser activities for learning.

## View

Open the published project site or serve the repository locally:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then visit `http://127.0.0.1:8000/`. The catalog requires HTTP because browsers usually block local JSON requests from `file://` pages.

## Structure

- `activities.json` is the V2 catalog metadata authority: one controlled tag registry plus activity records.
- `activities/<subject>/<GG>-<id>/` contains standalone activities.
- `assets/` contains only catalog styles and behavior.
- `scripts/validate_catalog.py` validates metadata, paths, links, and public-safety rules.

## Add an activity

1. Add a standalone, local-only activity at `activities/math/<GG>-<id>/` or `activities/computer-science/<GG>-<id>/`.
2. Add only genuinely applicable tag IDs to its record. Add a registry entry only when at least one real activity uses it; keep registry order `purpose`, `topic`, `format`, then ASCII ID.
3. Keep grades ascending, activity tags in registry order, and records ordered by subject, primary grade, then ID.
4. Run `python3 scripts/test_catalog_v2.py`, `node scripts/test_catalog.js`, and `python3 scripts/validate_catalog.py`.
5. Serve locally and test navigation, keyboard use, mobile layout, reduced motion, and network requests.

## Privacy

The activities add no accounts, forms, analytics, telemetry, or application data collection. Do not add personal information, identifying content, or external services. The hosting provider may keep standard infrastructure logs under its own policies.
