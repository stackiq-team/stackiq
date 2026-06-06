# StackIQ

StackIQ is a web platform for analyzing a submitted `package.json` and tracking an analysis pipeline for its dependencies.

Sprint 1 focuses on the minimal end-to-end flow:

- submit a `package.json`
- parse `dependencies` and `devDependencies`
- create an analysis linked to the submitted email
- enqueue a BullMQ job
- process the job in a worker
- score dependencies and update the analysis status

## Tech Stack

- Frontend: React with Vite
- Backend: Node.js, Express, TypeScript
- Worker: Node.js, TypeScript, BullMQ
- Database: PostgreSQL
- Cache/queue: Redis
- ORM: Prisma
- Containers: Docker and Docker Compose

## Prerequisites

Install and start:

- Docker Desktop
- Node.js

Docker must be running before you use the commands below.

## Environment

Create a local `.env` file from the example:

```powershell
copy .env.example .env
```

For local development, these values are enough:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=stackiq
POSTGRES_PORT=65432
DATABASE_URL=postgresql://postgres:postgres@db:5432/stackiq?schema=public
REDIS_URL=redis://redis:6379
BULLMQ_QUEUE_NAME=stackiq-analysis
BACKEND_PORT=4000
FRONTEND_PORT=5173
```

Do not commit real passwords or production connection strings.

## Run Everything

From the project root:

```powershell
cd c:\Users\mazig\PFE\stackiq
```

If this is your first time running the project, or you want a completely clean setup, run:

```powershell
npm run setup
```

This deletes the StackIQ Docker containers, local Docker volumes, and project-built Docker images, then rebuilds the services, waits for PostgreSQL and Redis, runs the Prisma migrations, and starts the full app.

After it finishes, open:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:4000
Health:   http://localhost:4000/health
```

For normal daily startup after the project has already been created once, run:

```powershell
npm start
```

`npm start` keeps your existing local database and Redis data.

## Command Scripts

### `npm start`

Starts all services using the existing local data. It does not delete the database, Redis data, containers, or images.

Use this for normal development when you do not want to reset the database.

Services started:

- frontend
- backend
- worker
- PostgreSQL
- Redis

### `npm run setup`

Fully resets and starts the project.

Use this as the one-command setup path. It runs the same script as `npm run clean-start`.

This command deletes local StackIQ Docker data.

### `npm run clean-start`

Resets and recreates the whole project.

Use this when you want a clean local environment. It deletes the local StackIQ containers, local PostgreSQL and Redis Docker volumes, and project-built Docker images, rebuilds all services, waits for PostgreSQL and Redis, runs the Prisma migrations, and starts everything again.

This command deletes local development data.

### `npm run clean-start:frontend`

Resets only the frontend service.

Use this when the Vite/React app needs a clean rebuild but the backend, worker, database, and Redis can stay as they are.

### `npm run clean-start:backend`

Resets only the backend service.

Use this when the API needs a clean rebuild. It also makes sure PostgreSQL and Redis are running, then runs the Prisma migrations before restarting the backend.

### `npm run clean-start:worker`

Resets only the worker service.

Use this when the background job processor needs a clean rebuild. It also makes sure PostgreSQL and Redis are running.

### `npm run clean-start:db`

Resets only the PostgreSQL database.

Use this when you want to recreate the database and reapply Prisma migrations without fully resetting the frontend, backend, worker, or Redis.

This command deletes local database data.

### `npm run docker:clean-all`

Deletes all Docker containers and all Docker images on this machine.

Use this only when you want to completely clear Docker containers and images. Docker volumes are not deleted.

The script asks for confirmation. To skip the prompt, run:

```powershell
npm run docker:clean-all -- -Force
```

### `npm test`

Runs the full test suite from the project root.

Test groups:

- root end-to-end analysis flow test
- backend API and queue tests
- worker processor tests
- frontend tests

### `npm run test:e2e`

Runs only the root end-to-end flow test.

The end-to-end test submits a `package.json` to the API, verifies that an analysis job is queued, runs the worker processor, and checks that analysis results and dependency scores are stored.

### `npm run test:backend`

Runs only backend tests.

### `npm run test:worker`

Runs only worker tests.

### `npm run test:frontend`

Runs only frontend tests.

### `npm run status`

Shows the current service status.

Use this to check which services are running.

### `npm run logs`

Shows live logs for all services.

Use this when something fails or you want to watch requests, server output, worker jobs, or database startup messages.

### `npm stop`

Stops the project services.

Use this when you are done working and want to shut down the local app.

## API

### `GET /health`

Checks whether the backend can reach PostgreSQL and Redis.

### `POST /analyses`

Creates a new package analysis.

Request type: `multipart/form-data`

Fields:

- `email`: required email address
- `file`: required `package.json` file, maximum 1 MB

Behavior:

- parses `dependencies` and `devDependencies`
- creates an `Analysis` with status `PENDING`
- creates child `Dependency` records
- enqueues a BullMQ job with the analysis id
- returns the created analysis and its private `resultToken`

The worker later marks the analysis `PROCESSING`, scores each dependency, stores `AnalysisResult` and `DependencyScore` records, then marks the analysis `COMPLETED`. On worker failure, the analysis is marked `FAILED` with an error message.

There is currently no public result lookup endpoint documented here.
