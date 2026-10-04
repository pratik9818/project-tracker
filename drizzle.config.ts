import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit reads the schema and writes SQL migrations into ./drizzle.
 * We never hand-edit generated SQL: change schema.ts, then run
 * `npm run db:generate`.
 *
 * The FTS5 table/triggers are the one exception — they live in a `--custom`
 * migration because drizzle-kit cannot model virtual tables.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true
})
