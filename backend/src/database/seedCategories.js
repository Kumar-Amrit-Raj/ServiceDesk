import pool from './pool.js';

const DEFAULT_CATEGORIES = [
  'Hardware',
  'Software',
  'Network',
  'Access & Accounts',
  'Other',
];

export default async function seedCategories() {
  await pool.query(
    `INSERT INTO categories (name)
     SELECT unnest($1::text[])
     ON CONFLICT (name) DO NOTHING`,
    [DEFAULT_CATEGORIES],
  );
}
