# Data migration service

Service that migrates data from legacy sources (WordPress, Certificate/Laravel MySQL, Tribe PostgreSQL, Auth PostgreSQL) into Convex.

## Prerequisites

- [Node.js](https://nodejs.org/) (24.x.x recommended)
- [pnpm](https://pnpm.io/) (yarn/npm also works)

## SSH tunnels (run before anything else)

You must have SSH port forwards in place to connect DBs on remote servers so that `pre-migration`, or `migration` can reach staging databases. Keep each `ssh` session running in its own terminal.



```bash
# STAGING_TRIBE_DB — Tribe PostgreSQL → localhost:5456
ssh -L 5456:localhost:5456 USERNAME@SERVER_IP

# STAGING_CERT_DB — Certificate / Laravel MySQL → localhost:3307
ssh -L 3307:127.0.0.1:3306 USERNAME@SERVER_IP

# STAGING_WP_DB — WordPress MySQL → localhost:3308
ssh -L 3308:127.0.0.1:3306 USERNAME@SERVER_IP
```

Notice that these local ports (`5456`, `3307`, `3308`) inside `.env` are connecting using localhost to remote servers with the help of tunneling.

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

   Use the [SSH tunnels](#ssh-tunnels-run-before-anything-else) above, or other network access as required by your environment.

6. **Migration statistics** are appended to `migration.log` (info-level messages from the Winston logger).

7. **Migration errors** are written to `migration-error.log` (error-level messages).

## Scripts

| Command | Description |
| --- | --- |
| `pnpm pre-migration` | Setup: mappings and template/program prep |
| `pnpm migration` | Main migration (`src/db-migration.ts`) |
| `npx convex dev` | Setup convex environment |
| `pnpm dev` | Run `src/index.ts` in watch mode |
