# ServiceDesk

A full-stack IT helpdesk and ticket management system built with React, Node.js, Express, and PostgreSQL.

**Live demo:** https://servicedesk-kgg4.onrender.com

## What it does

ServiceDesk lets users raise support tickets and allows support/admin users to manage them through a simple helpdesk workflow.

### Main features

- User registration and login
- User, support, and admin roles
- Create, assign, update, and track tickets
- Priority and status management
- Comments and ticket history
- SLA-style target tracking
- Search, filters, sorting, and pagination
- Duplicate-ticket checking
- Previous resolved-ticket suggestions
- Admin user/category management
- Support analytics

## Tech stack

- **Frontend:** React, JavaScript, CSS, Vite
- **Backend:** Node.js, Express
- **Database:** PostgreSQL on Neon
- **Authentication:** JWT + bcrypt
- **Deployment:** Render
- **Testing:** Backend integration tests + GitHub Actions CI

## How it works

1. A user logs in and creates a support ticket.
2. Support/admin users can view the support queue.
3. A ticket can be assigned and moved through its status workflow.
4. Comments and important changes are stored with the ticket.
5. SLA targets help show which tickets need attention.
6. Admin users can manage users, roles, and ticket categories.

## Run locally

### 1. Install dependencies

```sh
npm ci --prefix backend
npm ci --prefix frontend
```

### 2. Create `backend/.env`

```env
PORT=5000
DATABASE_URL=<your PostgreSQL connection string>
JWT_SECRET=<your private secret>
```

### 3. Initialize the database

Run:

```sh
psql -U postgres -d servicedesk -f backend/src/database/schema.sql
```

### 4. Start the app

Backend:

```sh
npm run dev --prefix backend
```

Frontend:

```sh
npm run dev --prefix frontend
```

Open `http://localhost:5173`.

## Deployment

The production app is deployed on **Render** and uses **Neon PostgreSQL**.

GitHub Actions automatically runs backend tests and builds the frontend on pushes to `main`.

---

Built as a portfolio project to demonstrate practical full-stack development with a real ticket-management workflow.
