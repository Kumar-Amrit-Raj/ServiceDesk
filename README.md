# ServiceDesk — Full-Stack IT Helpdesk & Ticket Management System

A college portfolio project for managing IT support requests with a React frontend, an Express REST API, and PostgreSQL.

**Status: Under Development — Phase 1 foundation only.**

## Tech stack

- Frontend: React.js, JavaScript, CSS, Vite, Axios
- Backend: Node.js, Express.js, dotenv, cors
- Database: PostgreSQL with the `pg` package
- Architecture: REST APIs

## Current scope

The foundation includes a frontend placeholder with an API connection indicator, `GET /api/health`, a PostgreSQL connection pool, and an initial SQL schema. The health endpoint checks that the API is running; it does not check database connectivity. The server can start before PostgreSQL is configured because the pool connects only when a query is made.

Authentication, roles, ticket CRUD, assignment, comments, filtering, history tracking, statistics, target resolution handling, duplicate detection, and resolved-ticket suggestions are **planned, not implemented**. Future duplicate detection and suggestions will use category and keyword matching.

## Folder structure

```text
ServiceDesk/
├── client/
│   ├── src/
│   │   ├── pages/HomePage.jsx
│   │   ├── services/api.js
│   │   ├── styles/index.css
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
├── server/
│   ├── src/
│   │   ├── config/env.js
│   │   ├── controllers/healthController.js
│   │   ├── database/
│   │   │   ├── pool.js
│   │   │   └── schema.sql
│   │   ├── middleware/errorHandler.js
│   │   ├── routes/healthRoutes.js
│   │   ├── app.js
│   │   └── server.js
│   ├── .env.example
│   ├── package.json
│   └── package-lock.json
├── .gitignore
└── README.md
```

## Local setup

### Prerequisites

- Node.js 24 LTS and npm
- PostgreSQL (including `psql`, or use pgAdmin to run the SQL)
- Git

### 1. Clone and install dependencies

```sh
git clone https://github.com/Kumar-Amrit-Raj/ServiceDesk.git
cd ServiceDesk
cd client
npm ci
cd ../server
npm ci
```

### 2. Configure the server

Copy `server/.env.example` to `server/.env`. From the `server` directory in PowerShell:

```powershell
Copy-Item .env.example .env
```

On macOS/Linux, use `cp .env.example .env`.

Keep `PORT=5000`. Set `DATABASE_URL` to your local PostgreSQL connection string using this format:

```text
postgresql://<username>:<password>@localhost:5432/servicedesk
```

Replace the placeholders with local credentials and URL-encode special characters in the username/password. Never commit `.env`. `JWT_SECRET` is reserved for future authentication and can remain blank in Phase 1.

### 3. Initialize PostgreSQL

Start your local PostgreSQL service. From the repository root, using your PostgreSQL administrator account (replace `postgres` if needed):

```sh
psql -U postgres -c "CREATE DATABASE servicedesk;"
psql -U postgres -d servicedesk -v ON_ERROR_STOP=1 -f server/src/database/schema.sql
```

The schema is intended for one-time execution on an empty database. It defines `users`, `categories`, `tickets`, `comments`, and `ticket_history` with keys, timestamps, and constraints. Future authentication must store password hashes; future ticket updates must explicitly update `updated_at`. Role-based assignment and history recording will be handled by future API logic.

### 4. Run the application

In one terminal:

```sh
cd server
npm run dev
```

In a second terminal:

```sh
cd client
npm run dev
```

Open the frontend URL printed by Vite (normally `http://localhost:5173`). Vite proxies `/api` requests to `http://localhost:5000`. If the server port changes, update the proxy in `client/vite.config.js`. Express CORS permits the default frontend origin.

Check `http://localhost:5000/api/health` for:

```json
{ "success": true, "message": "ServiceDesk API is running" }
```

### Build and start commands

```sh
# From client/
npm run build
npm run preview

# From server/
npm start
```

The frontend build is written to `client/dist`. Preview serves the built frontend locally. Use `npm run dev` for the documented development API proxy. Deployment and production API routing are outside Phase 1.
