# FCEERDocs (test-builder-app)

Vanilla JS SPA + Node.js server for building and exporting exam/test question papers.

## Commands

| Command | Action |
|---------|--------|
| `npm start` | Runs `node server.js` on port 4173 |

No tests, lint, typecheck, or build step. No CI.

## Entrypoints

- `server.js` — HTTP server, serves `public/` static files, delegates API routes
- `server/routes.js` — All API route handlers
- `server/db.js` — MongoDB connection (`questions` collection), schema normalization
- `server/pdf.js` — Two PDF engines: pdf-lib (structured data) and puppeteer (HTML→PDF)
- `public/app.js` — Client entrypoint, binds UI, orchestrates modules
- `public/js/config.js` — Constants, font options, subjects, default state
- `public/js/state.js` — localStorage-backed state (`test-builder-state-v3`), undo/redo (50 snapshots)

## API Endpoints

| Method | Path | Action |
|--------|------|--------|
| GET | `/api/questions` | List all questions |
| POST | `/api/questions` | Create question |
| POST | `/api/questions/duplicates` | Detect duplicates (Jaccard + Levenshtein, threshold ≥0.72) |
| POST | `/api/questions/bulk` | Bulk insert (ordered: false) |
| GET/PUT/DELETE | `/api/questions/:id` | CRUD single question |
| POST | `/api/export/pdf` | Puppeteer HTML→PDF export |

## Architecture Notes

- **ESM everywhere** (`"type": "module"` in package.json)
- **No framework** — vanilla JS modules in `public/js/`, CSS in `public/css/`
- **MongoDB is optional** — app works offline with localStorage state
- Allowed subjects: "Math 1 (algebra)", "Math 2 (word problems)", "Math 3 (geometry)", "Math 4 (statistics)", "Biology", "Physics", "Chem", "Earth and Space Science", "English Language Proficiency", "Kasanayan sa Wikang Filipino", "Reading Comprehension"
- Allowed exam types: "practice test", "mock test", "test"
- "mock test" disables exam number field
- Page dimensions: 794×1123 px (A4), two-column compact by default
- PDF font mapping: Calibri→Helvetica, Times New Roman→TimesRoman, Courier→Courier
- Math notation: `%%expression%%` delimiters → plain text via regex
- Chromium path: checks `CHROMIUM_PATH` env, hardcoded Windows paths, then Linux fallback
- Vercel detection: `process.env.VERCEL` → uses `@sparticuz/chromium`
- SVG images in PDF: converted to PNG via sharp before embedding
- Hardcoded dependency paths in `pdf.js` point to `codex-runtimes` cache (dev-specific)
- CSV import in `public/js/csv-import.js` — supports quoted fields, custom delimiter
- `.bak` files in `server/` are stale; ignore them
