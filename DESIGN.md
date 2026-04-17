# leah-neon-demo

## Vision

The app has two tabs. The first tab enables a user to query data from the API and write it to a Neon db. The second tab enables the user to write queries against that db and see the output.

## Status

MVP built. Two-tab interface wired to the Lovelace Elemental API and Neon
Postgres. Deploy to main to activate the Neon connection — locally the app
shows a "database not configured" state because `DATABASE_URL` is not
available in local development yet.

## Modules

### Tab 1 — Import from API (`components/ImportTab.vue`)

Full-text search over the Lovelace knowledge graph. Results are rendered as
selectable cards with flavor (entity type), score, and NEID. Clicking
"Import" fetches a canonical set of properties (name, country, industry,
sector, website, ticker, lei_code, description, headquarters, ceo — or
whatever the schema exposes) for every selected entity and upserts them
into the `imported_entities` Postgres table.

### Tab 2 — Query Database (`components/QueryTab.vue`)

A read-only SQL workbench for the Neon database.

- Monospace textarea with Ctrl/Cmd+Enter to run
- Live schema sidebar (tables + columns) with click-to-insert
- Four example queries wired to the `imported_entities` table / JSONB column
- Results table with row count, elapsed time, and CSV export
- Server enforces SELECT / WITH / EXPLAIN / SHOW / TABLE / VALUES only and
  rejects multi-statement inputs

### Supporting pieces

- `components/DbStatusBar.vue` — connection health pill at the top of the
  page with a refresh button
- `server/utils/neon.ts` — Neon client + `ensureTables()` helper that
  creates `imported_entities` on first use
- `server/api/db/{status,schema,import,query}` — lifecycle and data routes
- `server/api/elemental/{search,properties}` — gateway proxy routes that
  keep the `X-Api-Key` on the server

### Data model

```sql
CREATE TABLE imported_entities (
    id SERIAL PRIMARY KEY,
    neid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    flavor TEXT,
    properties JSONB DEFAULT '{}'::jsonb,
    search_query TEXT,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
```

Upserts key on `neid`, so re-importing an entity refreshes its properties
instead of creating duplicates.

## Known limitations

- **Local dev** cannot reach Neon yet (the Broadchurch platform does not
  inject `DATABASE_URL` for local runs). The UI surfaces this clearly and
  everything works on the deployed Vercel build.
- SQL tab allows arbitrary read queries against `public.*` tables, not just
  `imported_entities`. This is intentional for the demo — in production you
  would use a dedicated read-only Postgres role with a statement timeout.
