import '../config/env.js';
import pg from 'pg';

if (!process.env.DATABASE_URL?.trim()) {
  throw new Error('DATABASE_URL must be configured in backend/.env or the deployment environment.');
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (error) => {
  console.error('Unexpected idle PostgreSQL connection error:', error.message);
});

export default pool;
