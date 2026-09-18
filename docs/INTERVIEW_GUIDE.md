# ServiceDesk Interview Guide

This file is a compact reference for explaining the project in interviews. Keep answers conversational rather than memorizing them word-for-word.

## 30-second project summary

ServiceDesk is a full-stack IT helpdesk platform built with React, Node.js, Express, and PostgreSQL. It supports three roles—user, support, and admin—with server-side authorization. Users can raise support tickets, support agents can assign and progress them through a workflow, and admins can manage users and ticket categories. The project also includes SLA-style tracking, comments, audit history, duplicate-ticket detection, previous-solution suggestions, operational analytics, filtering, sorting, and server-side pagination.

## Architecture

```text
React + Vite
     |
   Axios
     |
 REST API
     |
Express / Node.js
     |
PostgreSQL
```

Authentication uses JWT. Protected API requests pass through authentication middleware that verifies the token and reloads the user's current role from the database.

## Key engineering decisions

### Why PostgreSQL?

The project has strongly relational data:

- users create tickets;
- tickets belong to categories;
- tickets can be assigned to agents;
- comments belong to tickets and users;
- workflow changes belong to tickets and users.

PostgreSQL makes these relationships explicit through foreign keys and works well for filters, joins, aggregates, and transactional workflow updates.

### Why not trust the role inside the JWT?

The token is used to identify the user, but the current role is read from PostgreSQL on authenticated requests.

This means an admin can promote or demote a user and the permission change takes effect without waiting for an old token containing a stale role to expire.

### Why separate comments and ticket history?

Comments are conversation content.

Ticket history is an audit trail for system/workflow changes such as:

- status changes;
- assignment changes.

Keeping them separate makes the history easier to query and explain.

### Why use a transaction for workflow updates?

A ticket update and its history entries represent one logical operation.

The backend uses a PostgreSQL transaction so the ticket state and audit history are committed together. If an error occurs, the operation is rolled back.

### How does SLA tracking work?

A target resolution timestamp is calculated at ticket creation:

- high: 12 hours;
- medium: 24 hours;
- low: 48 hours.

The API derives states such as on-track, due-soon, overdue, met, and breached by comparing current/resolution time with the target timestamp.

### How does duplicate detection work?

The project deliberately uses deterministic logic rather than claiming AI.

The flow:

1. normalize ticket text;
2. remove common stop words;
3. compare tickets in the same category;
4. calculate keyword overlap;
5. show sufficiently similar active tickets.

This keeps the feature explainable and testable.

### How do previous-solution suggestions work?

The same matching approach is applied to resolved/closed tickets. A relevant support note can be surfaced as previous troubleshooting context.

### Why server-side pagination?

Client-side slicing would still require downloading the entire queue.

Server-side pagination:

- limits rows returned by PostgreSQL;
- works correctly with filters and sorting;
- returns total count and total pages;
- scales better as ticket volume grows.

### How is sorting kept safe?

The frontend sends a predefined sort key such as `newest`, `priority`, or `sla`.

The backend maps that key to a fixed SQL ORDER BY expression. Raw client input is never inserted directly into SQL.

### How are admin roles protected?

Public registration can only create normal users.

Admin-only endpoints are protected by authentication plus role middleware. The normal admin user-management endpoint can promote/demote user/support accounts, but it cannot change another admin or demote the currently logged-in admin.

## Important backend flows

### Create ticket

```text
Authenticate
   ↓
Validate input
   ↓
Validate active category
   ↓
Calculate SLA target
   ↓
INSERT ticket
   ↓
Return joined ticket view
```

### Update ticket workflow

```text
Authenticate
   ↓
Authorize support/admin
   ↓
Validate status/assignee
   ↓
BEGIN transaction
   ↓
Lock ticket row
   ↓
Update state
   ↓
Insert history records
   ↓
COMMIT
```

### List ticket queue

```text
Authenticate
   ↓
Apply user visibility rule
   ↓
Apply filters
   ↓
Validate sort/page parameters
   ↓
Count + queue summary query
   ↓
Paginated sorted SELECT
   ↓
Return tickets + pagination + summary
```

## Security points worth mentioning

- bcrypt password hashing;
- JWT authentication;
- role checks on the server, not just the UI;
- parameterized PostgreSQL queries;
- ownership checks for normal users;
- privileged roles cannot be selected during signup;
- secrets stored in environment variables;
- disabled categories cannot be used for new tickets.

## Testing strategy

The backend uses integration tests against PostgreSQL.

Coverage includes:

- authentication and authorization;
- ticket visibility;
- workflow updates;
- comments and history;
- SLA behavior;
- duplicate detection;
- previous-solution suggestions;
- pagination and sorting;
- assignee filters;
- admin user/category controls;
- analytics authorization.

A production frontend build is also used as a final compile check.

## Resume-ready bullets

Choose two or three of these depending on available space:

- Built a full-stack IT helpdesk platform using React, Node.js, Express, and PostgreSQL with JWT authentication and role-based access for users, support agents, and admins.
- Implemented ticket assignment/status workflows, comments, transactional audit history, SLA tracking, advanced queue filtering/sorting, and server-side pagination.
- Developed admin user/category management and support analytics using PostgreSQL joins, aggregate queries, and protected REST APIs.
- Added deterministic duplicate-ticket detection and resolved-ticket suggestions with privacy-aware visibility rules and PostgreSQL-backed integration tests.

## Common interview questions

### What was the hardest part?

A good answer is the interaction between authorization, workflow state, and audit history. The backend has to ensure only authorized staff can update tickets while keeping the ticket state and history consistent.

### What would you improve for a real production system?

Possible improvements:

- refresh-token rotation and secure cookie-based sessions;
- password reset and email verification;
- rate limiting and abuse protection;
- file attachment scanning/storage;
- notification system;
- structured migrations;
- observability/logging;
- stronger deployment/secret management;
- broader frontend automated testing.

### Why not MongoDB?

PostgreSQL fits this project because the data is relational and the application frequently joins users, tickets, categories, comments, and history. It also makes transactional updates and aggregate analytics straightforward.

### What would happen with thousands of tickets?

The queue already uses server-side pagination and filtering. For larger scale, the next step would be adding indexes based on real query patterns—for example status, category, assignee, timestamps—and checking queries with `EXPLAIN ANALYZE`.
