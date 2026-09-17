# ServiceDesk — Full-Stack IT Helpdesk & Ticket Management System

A college portfolio project for managing IT support requests with a React frontend, an Express REST API, and PostgreSQL.

**Status: Under Development — Phase 2 authentication and role foundation implemented.**

## Tech stack

- Frontend: React.js, JavaScript, CSS, Vite, Axios
- Backend: Node.js, Express.js, dotenv, cors
- Authentication: bcryptjs password hashing and jsonwebtoken
- Database: PostgreSQL with the `pg` package
- Architecture: REST APIs

## Implemented features

- Registration with input validation, trimmed names/emails, lowercase emails, and duplicate-email handling.
- Password hashing with bcrypt (cost 12). Passwords must contain at least 8 characters and fit within bcrypt's 72-byte UTF-8 limit.
- Public registration always creates a `user`; submitted roles and IDs are ignored.
- Login with a JWT valid for one day. Its payload contains the user ID plus issued-at and expiry timestamps.
- Protected profile endpoint that loads the current user and role from PostgreSQL on each request.
- Reusable `authorizeRoles(...roles)` middleware for future role-restricted routes. It returns 401 without authentication and 403 for a disallowed role; no admin-only business routes exist yet.
- Minimal registration/login pages, a signed-in welcome state showing name/email/role, refresh restoration through `/api/auth/me`, and logout.
- Existing health endpoint and the five-table foundation schema.

Ticket CRUD, assignment, comments, search/filtering, history recording, dashboard statistics, target resolution handling, duplicate detection, and resolved-ticket suggestions are **not implemented**. Future duplicate detection and suggestions will use category and keyword matching.

## Folder structure

```text
ServiceDesk/
├── frontend/
│   ├── src/
│   │   ├── components/AuthForm.jsx
│   │   ├── pages/
│   │   │   ├── HomePage.jsx
│   │   │   ├── LoginPage.jsx
│   │   │   └── RegisterPage.jsx
│   │   ├── services/api.js
│   │   ├── styles/index.css
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── package-lock.json
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── auth.js
│   │   │   └── env.js
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   └── healthController.js
│   │   ├── database/
│   │   │   ├── pool.js
│   │   │   └── schema.sql
│   │   ├── middleware/
│   │   │   ├── authenticate.js
│   │   │   ├── authorizeRoles.js
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── authRoutes.js
│   │   │   └── healthRoutes.js
│   │   ├── app.js
│   │   └── server.js
│   ├── test/auth.test.js
│   ├── .env.example
│   ├── package.json
│   └── package-lock.json
├── .gitignore
└── README.md
```

## Local setup

### Prerequisites

- Node.js 24 LTS and npm
- PostgreSQL 17 (with `psql`, or pgAdmin)
- Git

### 1. Install dependencies

After cloning the repository, run from its root:

```sh
cd frontend
npm ci
cd ../backend
npm ci
```

### 2. Configure the server

Keep your existing `backend/.env`. For a fresh clone only, copy `backend/.env.example` to `backend/.env` and configure:

- `PORT=5000`
- `DATABASE_URL`: `postgresql://<username>:<password>@localhost:5432/servicedesk`
- `JWT_SECRET`: a long, randomly generated private value

URL-encode special characters in database credentials. Generate a JWT secret locally, for example with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, and place it only in your local `.env`. The server refuses to start without a nonblank JWT secret; there is no fallback secret.

Never commit `.env` or copy real credentials into source code. The existing local database and environment require no migration for Phase 2.

### 3. Database

Start the PostgreSQL service. The existing `servicedesk` database already has `users`, `categories`, `tickets`, `comments`, and `ticket_history`: **do not rerun the schema on that database**.

Only for a fresh, empty installation, from the repository root:

```sh
psql -U postgres -c "CREATE DATABASE servicedesk;"
psql -U postgres -d servicedesk -v ON_ERROR_STOP=1 -f backend/src/database/schema.sql
```

The schema is a one-time initialization file, not a migration script. No tables are recreated by application startup or the tests. Future ticket update logic will explicitly maintain `updated_at`.

### 4. Run the application

In separate terminals, starting from the repository root:

```sh
cd backend
npm run dev
```

```sh
cd frontend
npm run dev
```

Open `http://localhost:5173`. Register an account, log in, refresh to restore the session, and log out.

Vite proxies `/api` to `http://localhost:5000`. Express CORS permits `http://localhost:5173`. If port 5000 is occupied, identify the owning process before stopping anything; do not permanently change ports just to work around a stale development server.

### Build and server start

```sh
# From frontend/
npm run build
npm run preview

# From backend/
npm start
```

The frontend build is written to `frontend/dist`. Use `npm run dev` for the documented development API proxy. Production deployment and API routing are not configured yet.

## API endpoints

| Method | Endpoint | Input / access | Response |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | `{ success: true, message: "ServiceDesk API is running" }` |
| POST | `/api/auth/register` | JSON: `name`, `email`, `password` | 201 with `{ user }`; 400 for validation; 409 for duplicate email |
| POST | `/api/auth/login` | JSON: `email`, `password` | 200 with `{ token, user }`; 401 with `Invalid email or password` for bad credentials |
| GET | `/api/auth/me` | `Authorization: Bearer <token>` | 200 with `{ user }`; 401 for missing, invalid, expired, or deleted-user sessions |

Every returned user contains only `id`, `name`, `email`, and `role`. Password hashes are never returned. Database queries use parameters. The health endpoint reports API availability, not database connectivity.

For future protected routes, use `authenticate` before `authorizeRoles('support', 'admin')`. Elevated roles must be assigned by a trusted database administrator; there is no public role-management endpoint or UI.

## Session scope

The frontend stores the JWT in localStorage for this phase and attaches it to Axios requests. On refresh, it validates the session with `/api/auth/me`. Invalid sessions return to login; connection failures offer a retry.

Logout removes the browser's token. Tokens are not revoked server-side and remain valid until expiry if copied elsewhere. There are no refresh tokens, password reset, email verification, or login rate limits yet. This is a local portfolio foundation, not a production-hardened authentication service.

## Verification

From `backend/`, with the local PostgreSQL service running and `.env` configured:

```sh
npm test
```

The Node.js built-in test runner exercises registration, validation, stored password hashing, duplicate emails, login failures, JWT expiry/signature validation, safe profile responses, current database roles, authorization middleware, deleted-user sessions, and the health endpoint. It creates a uniquely named test user, changes only that user's role, and deletes that user afterward. It does not drop or recreate tables. Interrupted runs may leave an `auth-test-...@example.com` user behind.

From `frontend/`, run `npm run build` to verify the production bundle.
