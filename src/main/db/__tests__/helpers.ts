import { resolve } from 'node:path'
import { openMigratedDatabase } from '../migrate'
import type { DatabaseHandle } from '../client'

/** A fresh, fully migrated, in-memory database for one test. */
export function testDatabase(): DatabaseHandle {
  return openMigratedDatabase(':memory:', resolve('drizzle'))
}
