import '../config/env.js';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (error) => {
  console.error('Unexpected idle PostgreSQL connection error:', error.message);
});

export default pool;
