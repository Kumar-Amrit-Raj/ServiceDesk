# ServiceDesk — Full-Stack IT Helpdesk & Ticket Management System

ServiceDesk is a full-stack IT support application built with React, Node.js, Express, and PostgreSQL. It models a realistic helpdesk workflow with role-based access, ticket assignment, SLA-style target tracking, comments, audit history, admin controls, operational analytics, queue filtering, sorting, and server-side pagination.

**Status:** Feature-complete locally. Pre-deployment verification and final presentation review are in progress.

## Tech stack

- **Frontend:** React, JavaScript, CSS, Vite, Axios
- **Backend:** Node.js, Express
- **Database:** PostgreSQL with `pg`
- **Authentication:** JWT + bcryptjs
- **Architecture:** REST API
- **Testing:** Node.js built-in test runner with PostgreSQL integration tests

## Core capabilities

### Authentication and authorization

- Registration and login with hashed passwords.
- JWT-based authentication with one-day expiry.
- Roles: `user`, `support`, and `admin`.
- Public registration always creates a normal user.
- The authenticated user's current role is reloaded from PostgreSQL on protected requests instead of trusting a role embedded in the token.
- Reusable role-based authorization middleware protects support/admin and admin-only actions.

### Ticket workflow

- Create tickets with subject, category, priority, and description.
- Priorities: `low`, `medium`, `high`.
- Status workflow: `open`, `in_progress`, `resolved`, `closed`.
- Normal users can only access their own tickets.
- Support/admin users can access the shared support queue.
- Support/admin users can assign tickets to support/admin agents and update ticket status.
- Comments support requester/support communication.
- Ticket history records assignment and status changes.

### Queue management

The ticket queue supports:

- Text search.
- Status filtering.
- Priority filtering.
- Category filtering.
- Assignee filtering for staff, including **Unassigned**.
- SLA-state filtering.
- Sorting by:
  - newest,
  - oldest,
  - priority,
  - SLA deadline,
  - recently updated.
- Server-side pagination with total counts and stable filtered summaries.

### SLA-style tracking

Target resolution time is calculated when a ticket is created:

| Priority | Target |
| --- | ---: |
| High | 12 hours |
| Medium | 24 hours |
| Low | 48 hours |

Ticket SLA states:

- `on_track`
- `due_soon` — target is within the next 4 hours
- `overdue`
- `met`
- `breached`

The UI displays target time, remaining/overdue time, SLA badges, and an SLA Watch summary.

### Duplicate-ticket detection

Before opening a ticket, ServiceDesk can check active tickets in the same category using deterministic keyword overlap.

- No AI/ML model is required.
- Hyphenated terms such as `Wi-Fi` are normalized.
- Common stop words are ignored.
- Matching results show ticket ID, shared keywords, status, and match percentage.
- Users may review an existing request before explicitly choosing **Create Anyway**.
- Normal users only see duplicate candidates from their own tickets; support/admin users can compare across the queue.

### Previous resolved-ticket suggestions

ServiceDesk can also suggest similar resolved/closed tickets from the same category.

- Uses the same deterministic matching strategy.
- Can surface the latest relevant support note as troubleshooting context.
- Normal users only receive suggestions from their own historical tickets.
- Support/admin users can use resolved tickets across the support queue.

### Admin controls

Admin-only tools include:

- User management:
  - promote `user` → `support`,
  - demote `support` → `user`,
  - prevent self-demotion,
  - prevent changing another admin through the normal user-management screen.
- Category management:
  - create categories,
  - rename categories,
  - enable/disable categories,
  - preserve historical tickets when a category is disabled.
- Disabled categories are removed from new-ticket choices and cannot be used to create new tickets.

### Support analytics

Support and admin users can view operational metrics including:

- total tickets,
- open/in-progress tickets,
- resolved/closed tickets,
- current overdue tickets,
- SLA met vs breached,
- SLA compliance percentage,
- average resolution time,
- tickets by priority,
- top ticket categories.

## Database model

The PostgreSQL schema contains five main tables:

- `users`
- `categories`
- `tickets`
- `comments`
- `ticket_history`

Important relationships:

- each ticket belongs to one requester;
- a ticket may be assigned to a support/admin user;
- each ticket belongs to a category;
- comments belong to both a ticket and an author;
- workflow changes are stored separately from comments in `ticket_history`.

Categories include an `is_active` flag so they can be disabled without deleting historical ticket data.

## Folder structure

```text
ServiceDesk/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   │   ├── adminController.js
│   │   │   ├── analyticsController.js
│   │   │   ├── authController.js
│   │   │   ├── duplicateController.js
│   │   │   ├── healthController.js
│   │   │   ├── solutionController.js
│   │   │   └── ticketController.js
│   │   ├── database/
│   │   │   ├── pool.js
│   │   │   ├── schema.sql
│   │   │   └── seedCategories.js
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── app.js
│   │   └── server.js
│   ├── test/
│   │   ├── auth.test.js
│   │   ├── duplicates.test.js
│   │   ├── management.test.js
│   │   ├── queue.test.js
│   │   ├── sla.test.js
│   │   ├── solutions.test.js
│   │   └── tickets.test.js
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── styles/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── docs/
│   └── INTERVIEW_GUIDE.md
├── .gitignore
└── README.md
```

## Local setup

### Prerequisites

- Node.js and npm
- PostgreSQL 17 or a compatible version
- Git

### 1. Clone and install

```sh
git clone https://github.com/Kumar-Amrit-Raj/ServiceDesk.git
cd ServiceDesk

cd backend
npm ci

cd ../frontend
npm ci
```

### 2. Configure the backend

Create `backend/.env` from `backend/.env.example`:

```env
PORT=5000
DATABASE_URL=postgresql://<username>:<password>@localhost:5432/servicedesk
JWT_SECRET=<long-random-private-value>
```

Never commit real credentials.

### 3. Initialize a fresh database

```sh
psql -U postgres -c "CREATE DATABASE servicedesk;"
psql -U postgres -d servicedesk -v ON_ERROR_STOP=1 -f backend/src/database/schema.sql
```

`schema.sql` is intended for a fresh database.

### 4. Run locally

Backend:

```sh
cd backend
npm run dev
```

Frontend in a second terminal:

```sh
cd frontend
npm run dev
```

Open:

```text
http://localhost:5173
```

Vite proxies `/api` requests to the Express backend on port 5000 during development.

## API overview

### Authentication

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | API health check |
| POST | `/api/auth/register` | Register a user |
| POST | `/api/auth/login` | Login and receive JWT |
| GET | `/api/auth/me` | Restore authenticated user |

### Tickets

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/tickets` | List accessible tickets with filters, sorting, pagination and queue summary |
| POST | `/api/tickets` | Create a ticket |
| GET | `/api/tickets/:id` | Read one accessible ticket |
| PATCH | `/api/tickets/:id` | Update assignment/status — support/admin |
| GET | `/api/tickets/support-agents` | List valid assignees — support/admin |
| GET | `/api/tickets/analytics` | Operational analytics — support/admin |
| GET | `/api/tickets/:id/comments` | List comments |
| POST | `/api/tickets/:id/comments` | Add a comment |
| GET | `/api/tickets/:id/history` | Read workflow history |
| POST | `/api/tickets/duplicate-check` | Find similar active tickets |
| POST | `/api/tickets/solution-suggestions` | Find similar resolved tickets |

### Categories and admin

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/categories` | List active categories |
| GET | `/api/admin/users` | List users — admin |
| PATCH | `/api/admin/users/:id/role` | Change user/support role — admin |
| GET | `/api/admin/categories` | List all categories — admin |
| POST | `/api/admin/categories` | Create category — admin |
| PATCH | `/api/admin/categories/:id` | Rename/enable/disable category — admin |

## Verification

Backend integration tests:

```sh
cd backend
npm test
```

The suite covers authentication, authorization, ticket access, workflow updates, comments, history, SLA behavior, duplicate detection, resolved-ticket suggestions, server-side queue pagination, sorting, assignee filtering, admin controls, category activation rules, and analytics authorization.

Frontend production build:

```sh
cd frontend
npm run build
```

Current CI verification: **60 backend tests passing, 0 failing**, and the frontend production build completes successfully.

The repository also includes a GitHub Actions workflow at `.github/workflows/ci.yml` that provisions PostgreSQL 17, initializes the schema, runs the backend integration suite, and builds the frontend on pushes and pull requests to `main`.

## Security and scope notes

- Passwords are hashed with bcrypt.
- SQL queries use parameterized values.
- Public registration cannot create privileged accounts.
- Role authorization is enforced server-side.
- Normal users cannot access another user's ticket.
- Real secrets belong in environment variables and are excluded from Git.
- The frontend currently stores the JWT in `localStorage`, which is acceptable for this portfolio scope but is not presented as a production-hardened identity platform.
- Refresh-token rotation, password reset, email verification, advanced rate limiting, file scanning, and server-side token revocation are intentionally outside the current project scope.

## Project focus

ServiceDesk is intentionally built around explainable full-stack engineering rather than adding unrelated features. The project demonstrates relational modelling, REST API design, PostgreSQL queries, authentication/authorization, workflow state, audit history, filtering/sorting/pagination, deterministic matching logic, analytics, testing, and responsive React UI.
