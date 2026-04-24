import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

import * as schema from '~/drizzle/schema';

console.log('Initializing Central DB Client...');

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!_db) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    _db = drizzle(pool, { schema });
  }
  return _db;
}
