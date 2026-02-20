import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'intrview',
  user: process.env.DB_USER || 'intrview',
  password: process.env.DB_PASSWORD || '',
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map(r => r.filename));

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => /^\d+.*\.sql$/.test(f))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      console.log(`✅ Applied: ${file}`);
      count++;
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error(`❌ Failed: ${file}\n   ${err.message}`);
      process.exit(1);
    }
  }

  if (count === 0) {
    console.log('✅ Already up to date');
  } else {
    console.log(`\n✅ ${count} migration(s) applied`);
  }

  await pool.end();
}

migrate().catch(err => {
  console.error('Migration error:', err.message);
  process.exit(1);
});
