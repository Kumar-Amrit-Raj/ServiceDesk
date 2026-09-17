import './env.js';

if (!process.env.JWT_SECRET?.trim()) {
  throw new Error('JWT_SECRET must be configured in backend/.env before starting the server.');
}

export const jwtSecret = process.env.JWT_SECRET;
