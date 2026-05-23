# StackIQ

StackIQ is a web platform for analyzing a submitted `package.json` and tracking an analysis pipeline for its dependencies.

Sprint 1 focuses on the minimal end-to-end flow:

- submit a `package.json`
- parse `dependencies` and `devDependencies`
- create a stack analysis
- enqueue a BullMQ job
- process the job in a worker
- update the analysis status

## Tech Stack

- Frontend: React with Vite
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Containers: Docker and Docker Compose

## Prerequisites

Install and start:

- Docker Desktop
- Docker Compose
- Node.js, if running backend commands outside Docker

## Environment

Create a local `.env` file from the example:

```powershell
copy .env.example .env
```

The root `.env` file contains the database settings used by Docker and Prisma.
Do not commit real passwords or production connection strings.

```env
POSTGRES_USER=<database-user>
POSTGRES_PASSWORD=<database-password>
POSTGRES_DB=<database-name>
POSTGRES_PORT=<host-port>
DATABASE_URL=postgresql://<database-user>:<database-password>@db:5432/<database-name>?schema=public
```

Inside Docker, the database host is `db`.

If you run Prisma directly from your host machine instead of inside Docker, use `localhost`:

```env
DATABASE_URL=postgresql://<database-user>:<database-password>@localhost:<host-port>/<database-name>?schema=public
```

## Start The Database

From the project root:

```powershell
cd c:\Users\mazig\PFE\stackiq
docker compose up -d db
```

Check that the database is running:

```powershell
docker compose ps
```

The `db` service should show as healthy.

## Build The Prisma Tables

Run the Prisma migration inside the backend container:

```powershell
docker compose run --rm backend npm run db:migrate
```

This creates the Sprint 1 tables:

- `stacks`
- `dependencies`
- `analyses`
- `_prisma_migrations`

## Check The Tables

```powershell
docker compose exec db psql -U postgres -d stackiq -c "\dt"
```

You can also inspect a table:

```powershell
docker compose exec db psql -U postgres -d stackiq -c "\d analyses"
```

## Prisma Commands

Recommended: run Prisma through Docker Compose from the project root. This uses the Docker database host `db` from `DATABASE_URL`.

Use these commands when you want Prisma to prepare or validate the database layer:

```powershell
docker compose run --rm backend npm run db:generate
docker compose run --rm backend npm run db:migrate
docker compose run --rm backend npm test
```

What they do:

- `db:generate`: generates the TypeScript Prisma client from `backend/prisma/schema.prisma`. Run this after changing the Prisma schema.
- `db:migrate`: applies Prisma migrations to PostgreSQL and creates or updates the database tables. Run this when setting up the database or after changing models.
- `npm test`: runs the Prisma validation script. It checks the database connection, applied migrations, CRUD operations, and relations between `Stack`, `Dependency`, and `Analysis`.

Alternative: run Prisma directly from `backend/` on your host machine. For this option, first make sure `DATABASE_URL` uses `localhost` instead of `db`, then run:

```powershell
npm run db:generate
npm run db:migrate
npm test
```

## Validate The Database Setup

After migrations run:

```powershell
docker compose run --rm backend npm test
```

The validation checks:

- Prisma can connect to PostgreSQL
- migrations were applied
- a `Stack` can be created
- `Dependency` records can be created for dependencies and devDependencies
- an `Analysis` can be created and moved from `PENDING` to `PROCESSING`
- relationships between stack, dependencies, and analyses work

## Reset The Development Database

Use this when you want to drop and recreate the schema in development:

```powershell
docker compose run --rm backend npm run db:reset
```

To remove the PostgreSQL Docker volume completely:

```powershell
docker compose down -v
docker compose up -d db
docker compose run --rm backend npm run db:migrate
```

Only use `down -v` for local development because it deletes the database volume.

## Run The Project

Start all services:

```powershell
docker compose up -d
```

Backend:

```text
http://localhost:4000
```

Frontend:

```text
http://localhost:5173
```

Health check:

```powershell
curl http://localhost:4000/health
```
