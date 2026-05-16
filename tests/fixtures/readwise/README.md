# Readwise Test Fixtures

These fixtures are intended to be real Readwise export payloads (or sanitized copies), not synthetic data.

## Expected files

- `export-large.json`: A JSON payload in the shape returned by `GET /api/v2/export/` with at least one item in `results`.

## Notes

- Keep the JSON response shape intact.
- You may sanitize sensitive content (titles/authors/notes/URLs), but preserve field structure and edge-case formatting.
- Stress tests in `tests/template-render-stress.spec.ts` are skipped automatically when `export-large.json` is missing or empty.
