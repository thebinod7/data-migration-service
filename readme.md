# Data migration service

Service that migrates data from legacy sources (WordPress, Certificate/Laravel MySQL, Tribe PostgreSQL, Auth PostgreSQL) into Convex.

## Prerequisites

- [Node.js](https://nodejs.org/) (24.x.x recommended)
- [pnpm](https://pnpm.io/) (yarn/npm also works)

## Setup and migration

1. **Clone the repository and enter the project directory**

   ```bash
   git clone <repository-url>
   cd data-migration-service
   ```

2. **Create your environment file**

   ```bash
   cp env.example .env
   ```

3. **Install dependencies**

   ```bash
   pnpm install
   ```

4. **Run the pre-migration setup**

   ```bash
   pnpm pre-migration
   ```

   This script (`src/setup.ts`) prepares data for the main migration. It:

   - Writes **campaign type** id → slug mappings to `campaign-types-id-to-slug.json`
   - Writes **program** slug → Convex id mappings to `programs-by-slug.json`
   - Syncs certificate **image templates** into Convex and writes `templates-by-slug.json`

   Ensure `CONVEX_URL` (and related Convex settings) are correct before running this step.

5. **Run the migration**

   ```bash
   pnpm migration
   ```

   Before running, confirm you can reach **all** backing systems configured in `.env`:

   - WordPress MySQL 
   - Certificate / Laravel MySQL 
   - Tribe PostgreSQL 
   - Auth app PostgreSQL
   - Convex (`CONVEX_DEPLOYMENT`,`CONVEX_URL`, `CONVEX_SITE_URL`)

   Use SSH tunnels, or network access as required by your environment.

6. **Migration statistics** are appended to `migration.log` (info-level messages from the Winston logger).

7. **Migration errors** are written to `migration-error.log` (error-level messages).

## Configuration

Variables used by `src/config/index.ts` and related code:

| Variable | Purpose |
| --- | --- |
| `CONVEX_URL` | Convex deployment HTTP URL |
| `CONVEX_ADMIN_KEY` | Convex admin key (for mutations that need it) |
| `WP_DB_HOST`, `WP_DB_PORT`, `WP_DB_USER`, `WP_DB_PASSWORD`, `WP_DATABASE` | WordPress MySQL |
| `CERT_DB_HOST`, `CERT_DB_PORT`, `CERT_DB_USER`, `CERT_DB_PASSWORD`, `CERT_DATABASE` | Certificate / Laravel MySQL |
| `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, `PG_DATABASE` | Tribe PostgreSQL |
| `AUTH_DB_URL` | Auth PostgreSQL connection URL |


## Scripts

| Command | Description |
| --- | --- |
| `pnpm pre-migration` | Setup: mappings and template/program prep |
| `pnpm migration` | Main migration (`src/db-migration.ts`) |
| `npx convex dev` | Setup convex environment |
| `pnpm dev` | Run `src/index.ts` in watch mode |
