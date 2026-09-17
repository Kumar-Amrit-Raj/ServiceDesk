# ServiceDesk — Full-Stack IT Helpdesk & Ticket Management System

ServiceDesk is a full-stack IT helpdesk application built as a portfolio project using React, Node.js, Express, and PostgreSQL. It supports role-based ticket workflows, SLA-style target tracking, comments and activity history, deterministic duplicate detection, and suggestions from previously resolved tickets.

**Project status:** Core application complete and verified locally. Final deployment and presentation polish are in progress.

## Tech stack

- **Frontend:** React.js, JavaScript, CSS, Vite, Axios
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL with `pg`
- **Authentication:** bcryptjs + JWT
- **Architecture:** REST APIs
- **Testing:** Node.js built-in test runner with PostgreSQL integration tests

## Features

### Authentication and roles

- User registration and login.
- Password hashing with bcrypt using cost factor 12.
- JWT authentication with one-day expiry.
- Roles: `user`, `support`, and `admin`.
- Public registration always creates a normal `user` account.
- Current user role is loaded from PostgreSQL on authenticated requests instead of trusting the role stored in a token.
- Reusable role-based authorization middleware for support/admin actions.

### Ticket management

- Create support tickets with subject, category, priority, and description.
- Priorities: `low`, `medium`, and `high`.
- Status workflow: `open`, `in_progress`, `resolved`, and `closed`.
- Normal users can only access their own tickets.
- Support/admin users can work across the support queue.
- Support/admin users can assign tickets to support agents and update ticket status.
- Search and filter tickets by status, priority, SLA state, and text search.
- Ticket comments for requester/support communication.
- Ticket history records assignment and status changes.

### Target resolution / SLA tracking

Target resolution time is calculated when a ticket is created:

| Priority | Target |
| --- | ---: |
| High | 12 hours |
| Medium | 24 hours |
| Low | 48 hours |

Each ticket exposes an SLA-style state:

- `on_track`
- `due_soon` — target is within the next 4 hours
- `overdue`
- `met`
- `breached`

The dashboard includes SLA filtering, remaining/overdue time, and an SLA Watch summary when tickets are due soon or overdue.

### Duplicate-ticket detection

Before creating a ticket, ServiceDesk checks active tickets in the same category using deterministic keyword overlap.

- No AI/ML model is used.
- Hyphenated terms such as `Wi-Fi` are normalized for matching.
- Common stop words are ignored.
- A possible duplicate is shown when there are at least two shared keywords and the overlap score reaches the configured threshold, or when titles match exactly.
- The UI shows matching ticket IDs, shared keywords, status, and match percentage.
- Users can review the existing ticket or explicitly choose **Create Anyway**.
- Privacy rule: normal users only see duplicate candidates from their own tickets; support/admin users can compare across the queue.

### Previous resolved-ticket suggestions

ServiceDesk also checks similar `resolved` or `closed` tickets in the same category.

- Suggestions use the same deterministic category + keyword matching approach.
- A matching previous support note can be displayed as troubleshooting guidance.
- The UI labels this clearly as the **Last Support Note** rather than assuming it is always the final technical fix.
- Users can review the resolved ticket first or create a new ticket if the issue remains.
- Normal users only receive suggestions from their own past tickets; support/admin users can use resolved tickets across the queue.

## Folder structure

```text
ServiceDesk/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── duplicateController.js
│   │   │   ├── healthController.js
│   │   │   ├── solutionController.js
│   │   │   └── ticketController.js
│   │   ├── database/
│   │   │   ├── pool.js
│   │   │   └── schema.sql
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── app.js
│   │   └── server.js
│   ├── test/
│   │   ├── auth.test.js
│   │   ├── duplicates.test.js
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
├── .gitignore
└── README.md
```

## Database model

The PostgreSQL schema contains five main tables:

- `users`
- `categories`
- `tickets`
- `comments`
- `ticket_history`

Tickets reference their requester, optional assignee, and category through foreign keys. Comments reference both a ticket and an author. Ticket history stores workflow changes separately from conversation comments.

The schema also validates ticket timestamps such as target resolution, resolved time, and updated time.

## Local setup

### Prerequisites

- Node.js and npm
- PostgreSQL 17 or another compatible PostgreSQL installation
- Git

### 1. Clone and install dependencies

```sh
git clone https://github.com/Kumar-Amrit-Raj/ServiceDesk.git
cd ServiceDesk

cd backend
npm ci

cd ../frontend
npm ci
```

### 2. Configure the backend

Create `backend/.env` from `backend/.env.example` and configure:

```env
PORT=5000
DATABASE_URL=postgresql://<username>:<password>@localhost:5432/servicedesk
JWT_SECRET=<long-random-private-value>
```

Generate a private JWT secret locally if needed:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Never commit `.env` or real database credentials.

### 3. Create a fresh database

For a new empty local installation:

```sh
psql -U postgres -c "CREATE DATABASE servicedesk;"
psql -U postgres -d servicedesk -v ON_ERROR_STOP=1 -f backend/src/database/schema.sql
```

`schema.sql` is intended for fresh initialization rather than repeated migrations on an existing populated database.

### 4. Run the application

Start the backend:

```sh
cd backend
npm run dev
```

Start the frontend in another terminal:

```sh
cd frontend
npm run dev
```

Open:

```text
http://localhost:5173
```

During local development, Vite proxies `/api` requests to the Express backend on port 5000.

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
| GET | `/api/tickets` | List accessible tickets with filters |
| POST | `/api/tickets` | Create a ticket |
| GET | `/api/tickets/:id` | Read one accessible ticket |
| PATCH | `/api/tickets/:id` | Update assignment/status — support/admin |
| GET | `/api/tickets/support-agents` | List support/admin assignees — support/admin |
| GET | `/api/tickets/:id/comments` | List ticket comments |
| POST | `/api/tickets/:id/comments` | Add a comment |
| GET | `/api/tickets/:id/history` | Read ticket workflow history |
| POST | `/api/tickets/duplicate-check` | Find similar active tickets |
| POST | `/api/tickets/solution-suggestions` | Find similar resolved tickets |
| GET | `/api/categories` | List ticket categories |

## Frontend session scope

The frontend stores the JWT in `localStorage` and attaches it to API requests with Axios. On refresh, the application validates the session through `/api/auth/me`.

This is appropriate for the scope of this portfolio application, but it should not be described as a fully production-hardened authentication platform. Features such as refresh-token rotation, password reset, email verification, advanced rate limiting, and server-side token revocation are outside the current project scope.

## Verification

### Backend

With PostgreSQL running and `backend/.env` configured:

```sh
cd backend
npm test
```

The current integration suite covers authentication, authorization, ticket CRUD and workflow, comments, history, SLA states/filtering, duplicate detection, privacy rules, and resolved-ticket suggestions.

**Current verified result: 45 tests passing, 0 failing.**

### Frontend

```sh
cd frontend
npm run build
```

The Vite production build has been verified successfully.

## Current scope

ServiceDesk is intentionally kept as an explainable student full-stack project rather than being overloaded with unrelated infrastructure. The main focus is relational data modelling, REST APIs, authentication and authorization, realistic ticket workflow, PostgreSQL integration, deterministic matching logic, and a usable React interface.
