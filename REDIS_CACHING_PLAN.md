# DeployHub — Redis Caching & Invalidation Plan

> **Note**: This document outlines the complete Redis caching and event-driven cache invalidation architecture for DeployHub backend (`apps/api`) using [`apps/api/src/lib/cache.ts`](./apps/api/src/lib/cache.ts) (`getCache`, `setCache`, `deleteCache`, `deletePattern`).

---

## 1. Data Mutability Analysis & TTL Strategy

DeployHub data is divided into two operational categories:

### A. Immutable / Static Data (Long TTL: 7 Days)
- **Completed Workflow Run Jobs & Logs**: Once a run completes (`status === "completed"`), its step timings, runner name, conclusion, and parsed error logs are immutable.
  - **TTL**: **7 Days (`604,800s`)**.
  - **Invalidation Safeguard**: Handled via `workflow_job` and `workflow_run` webhooks if a workflow re-run is initiated on GitHub.

### B. Semi-Static & Event-Driven Data (Long TTL with Webhook Invalidation)
Because GitHub webhooks deliver real-time mutation events, we can use long TTLs and rely on event-driven invalidation:
- **GraphQL Project Metrics Aggregations (`metrics:project:${projectId}`)**:
  - MongoDB aggregations (`countDocuments`, `$avg` duration, top branches).
  - **TTL**: **1 Hour (`3,600s`)**.
  - **Invalidation**: Evicted whenever a `workflow_run` webhook is processed or `syncLatestWorkflowRuns` ingests new runs.
- **Top 5 Recent Workflow Runs (`project:recent_runs:${projectId}`)**:
  - **TTL**: **15 Minutes (`900s`)**.
  - **Invalidation**: Evicted on any `workflow_run` webhook or incremental sync.
- **GitHub Repository Metadata (`github:repo:${githubRepoId}`)**:
  - Repository metadata from GitHub API (`req.octokit.request("GET /repositories/{id}")`).
  - **TTL**: **24 Hours (`86,400s`)**.
  - **Invalidation**: Evicted on repository removal/uninstall webhook events.
- **User Session & Profile (`user:profile:${userId}`)**:
  - PostgreSQL user record and GitHub token looked up on every authenticated request by `requireAuth`.
  - **TTL**: **1 Hour (`3,600s`)**.
  - **Invalidation**: Evicted on OAuth callback (`githubCallback`) or token refresh.
- **User Projects List (`user:projects:${userId}`)**:
  - User's dashboard projects list.
  - **TTL**: **30 Minutes (`1,800s`)**.
  - **Invalidation**: Evicted on `installation` and `installation_repositories` webhooks.

---

## 2. Complete Cache & Invalidation Matrix

| Scope | Target Resource | Cache Key | TTL | Invalidation Handler | Invalidation Code / Mechanism |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Auth** | User Session / Profile / GitHub Token | `user:profile:${userId}` | **1 Hour** (3,600s) | `auth.controller.ts` -> `githubCallback` | `await deleteCache(\`user:profile:${user.id}\`)` |
| **Projects** | User Projects List | `user:projects:${userId}` | **30 Min** (1,800s) | `github.services.ts` -> `handleInstallationEvent` & `handleInstallationRepositoriesEvent` | `await deletePattern("user:projects:*")`<br>`if (installerId) await deleteCache(\`user:projects:${installerId}\`)` |
| **GitHub API**| Repo Details from Octokit | `github:repo:${githubRepoId}` | **24 Hours** (86,400s) | `github.services.ts` -> `handleInstallationRepositoriesEvent` | `await deleteCache(\`github:repo:${repoId}\`)` |
| **Recent Runs**| Top 5 Recent Workflow Runs | `project:recent_runs:${projectId}` | **15 Min** (900s) | `github.services.ts` -> `handleWorkflowRunEvent` & `syncLatestWorkflowRuns` | `await deleteCache(\`project:recent_runs:${projectId}\`)` |
| **Metrics** | GraphQL Project Metrics Aggregations | `metrics:project:${projectId}` | **1 Hour** (3,600s) | `github.services.ts` -> `handleWorkflowRunEvent` & `syncLatestWorkflowRuns` | `await deleteCache(\`metrics:project:${projectId}\`)` |
| **Jobs & Logs**| Completed Run Jobs & Failure Logs | `project:${projectId}:run:${runId}:jobs` | **7 Days** (604,800s) | `github.services.ts` -> `handleWorkflowJobEvent` & `handleWorkflowRunEvent` | `await deleteCache(\`project:${projectId}:run:${runId}:jobs\`)` |
| **Jobs & Logs**| In-Progress Run Jobs | `project:${projectId}:run:${runId}:jobs` | **15 Seconds** | `github.services.ts` -> `handleWorkflowJobEvent` | `await deleteCache(\`project:${projectId}:run:${runId}:jobs\`)` |

---

## 3. Step-by-Step Implementation & Invalidation Details

### Step 1: User Session & Auth Caching + Invalidation
**Files**:
- [`apps/api/src/modules/auth/auth.middleware.ts`](./apps/api/src/modules/auth/auth.middleware.ts)
- [`apps/api/src/modules/auth/auth.controller.ts`](./apps/api/src/modules/auth/auth.controller.ts)

* **Caching**:
  - `requireAuth`: Reads `user:profile:${payload.userId}` before querying Prisma. Caches for 1 hour (`3600s`).
  - `getCurrentUser`: Reads `user:profile:${payload.userId}` before querying Prisma.
* **Invalidation**:
  - `githubCallback`: Calls `await deleteCache(\`user:profile:${user.id}\`)` upon login or token update.

---

### Step 2: Project Listing & Repository Detail Caching + Invalidation
**Files**:
- [`apps/api/src/modules/github/github.controllers.ts`](./apps/api/src/modules/github/github.controllers.ts)
- [`apps/api/src/modules/github/github.services.ts`](./apps/api/src/modules/github/github.services.ts)

* **Caching**:
  - `getUserRepositoriesFromDb`: Reads `user:projects:${req.userId}` before querying Prisma. Caches for 30 minutes (`1800s`).
  - `getRepositoryDetailById`:
    - Caches GitHub API repo metadata under `github:repo:${project.github_repo_id}` for 24 hours (`86400s`).
    - Caches top 5 recent runs under `project:recent_runs:${project.id}` for 15 minutes (`900s`). Only triggers `syncLatestWorkflowRuns` on cache miss.
* **Invalidation**:
  - `handleInstallationEvent` & `handleInstallationRepositoriesEvent`:
    - `await deletePattern("user:projects:*");`
    - `if (installerId) await deleteCache(\`user:projects:${installerId}\`);`
    - When repo removed: `await deleteCache(\`github:repo:${repoId}\`);`
  - `handleWorkflowRunEvent` & `syncLatestWorkflowRuns`:
    - `await deleteCache(\`project:recent_runs:${projectId}\`);`

---

### Step 3: Workflow Run Jobs & Failure Logs Caching + Invalidation
**Files**:
- [`apps/api/src/modules/github/github.controllers.ts`](./apps/api/src/modules/github/github.controllers.ts)
- [`apps/api/src/modules/github/github.services.ts`](./apps/api/src/modules/github/github.services.ts)

* **Caching**:
  - `getWorkflowRunJobs`:
    - Check cache `project:${projectId}:run:${runId}:jobs`.
    - If miss: query MongoDB / GitHub Octokit, extract error logs.
    - If `run.status === "completed"`: `await setCache(\`project:${projectId}:run:${runId}:jobs\`, responseData, 604800);` (7 days).
    - If in-progress/queued: `await setCache(\`project:${projectId}:run:${runId}:jobs\`, responseData, 15);` (15s).
* **Invalidation**:
  - `handleWorkflowJobEvent`:
    - `await deleteCache(\`project:${project.id}:run:${jobPayload.run_id}:jobs\`);`
  - `handleWorkflowRunEvent`:
    - `await deleteCache(\`project:${project.id}:run:${runPayload.id}:jobs\`);`

---

### Step 4: GraphQL Metrics Aggregations Caching + Invalidation
**Files**:
- [`apps/api/src/modules/metrics/metrics.service.ts`](./apps/api/src/modules/metrics/metrics.service.ts)
- [`apps/api/src/modules/github/github.services.ts`](./apps/api/src/modules/github/github.services.ts)

* **Caching**:
  - `getProjectMetrics`:
    - Check cache `metrics:project:${projectId}`.
    - If miss: run the 7 MongoDB aggregations/counts and cache: `await setCache(\`metrics:project:${projectId}\`, metrics, 3600);` (1 hour).
* **Invalidation**:
  - `handleWorkflowRunEvent`:
    - `await deleteCache(\`metrics:project:${project.id}\`);`
  - `syncLatestWorkflowRuns`:
    - When `newRuns.length > 0`: `await deleteCache(\`metrics:project:${projectId}\`);`

---

## 4. Verification & Testing Strategy

1. **Commands**:
   - `pnpm --filter api test` — verify Vitest suite.
   - `pnpm --filter api build` — verify TypeScript compilation.
2. **Fail-Open Verification**:
   - Ensure all endpoints continue working if Redis is unavailable.
