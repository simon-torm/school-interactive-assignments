# Interactive School Assignments

A dependency-free catalog of privacy-first browser activities for learning.

## View

Open the published project site or serve the repository locally:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then visit `http://127.0.0.1:8000/`. The catalog requires HTTP because browsers usually block local JSON requests from `file://` pages.

## Structure

- `activities.json` is the catalog metadata authority.
- `activities/<subject>/<GG>-<id>/` contains standalone activities.
- `assets/` contains only catalog styles and behavior.
- `scripts/validate_catalog.py` validates metadata, paths, links, and public-safety rules.

## Add an activity

1. Add a standalone, local-only activity at `activities/math/<GG>-<id>/` or `activities/computer-science/<GG>-<id>/`.
2. Add its metadata to `activities.json`, keeping grades ascending and records ordered by subject, primary grade, then ID.
3. Run `python3 scripts/validate_catalog.py`.
4. Serve locally and test navigation, keyboard use, mobile layout, reduced motion, and network requests.

## Privacy

The activities add no accounts, forms, analytics, telemetry, or application data collection. Do not add personal information, identifying content, or external services. The hosting provider may keep standard infrastructure logs under its own policies.
