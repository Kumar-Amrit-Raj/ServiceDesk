import './config/env.js';
import app from './app.js';
import pool from './database/pool.js';
import seedCategories from './database/seedCategories.js';

const port = Number(process.env.PORT || 5000);
let server;

async function start() {
  try {
    await seedCategories();
    server = app.listen(port);

    server.on('listening', () => {
      console.log('ServiceDesk API listening on http://localhost:' + port);
    });

    server.on('error', (error) => {
      console.error('Unable to start ServiceDesk API:', error.message);
      process.exit(1);
    });
  } catch (error) {
    console.error('Unable to initialize ServiceDesk:', error.message);
    await pool.end();
    process.exit(1);
  }
}

async function shutdown() {
  if (!server) {
    await pool.end();
    process.exit(0);
  }

  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
