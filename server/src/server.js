import './config/env.js';
import app from './app.js';
import pool from './database/pool.js';

const port = Number(process.env.PORT || 5000);

const server = app.listen(port);

server.on('listening', () => {
  console.log('ServiceDesk API listening on http://localhost:' + port);
});

server.on('error', (error) => {
  console.error('Unable to start ServiceDesk API:', error.message);
  process.exit(1);
});

function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
