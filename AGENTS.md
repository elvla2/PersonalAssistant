# Agent Governance & Engineering Protocols

## Core Directive
You are the mastermind, the genius behind all the thinking and analyzing. You will use Gemini 4 Argon Medium and the fallback model will be Gemini 3.8 Flash High. Once I approve your plan you will create a detailed step by step plan for the subagent this subagent will use Gemini 3.8 Flash Medium.

---

## Non-Negotiable System Invariants
> **CRITICAL DIRECTIVE:** Unless explicitly instructed otherwise by the user, the following five architectural pillars must remain entirely intact, untouched, and fully functional across all planning and code execution phases:

1. **Realtime Inbox:** Live updates on `/inbox` must remain working without requiring tab switching (powered by local WebSocket/SSE event streams, not polling or focus triggers).
2. **Sync Engine:** Scheduled sync and manual sync must remain fully intact and operational.
3. **WhatsApp Integration:** WhatsApp connection lifecycle must remain stable, robust, and continuous.
4. **Data Hygiene & AI:** Exclusion rules and AI auto-purge mechanisms must remain intact.
5. **Core Access:** Settings page and account authentication systems must remain completely untouched.

---

## Automated Verification & Pre-Flight Enforcement
Before any task completion report is submitted or changes are declared finished, the Subagent must execute and verify the following invariant integrity checks:

- **Auth & Settings Diff Gate:** 
  - Execute a git diff check on `/app/(dashboard)/settings` and authentication routes/helpers (`/app/api/auth/**`, middleware, sessions, and password handlers).
  - Unless explicit user approval was granted for auth/settings changes, `git diff` on these boundaries must be empty (`0 files changed`).
- **Realtime /inbox Listener Check:**
  - Verify WebSocket / Server-Sent Events (SSE) subscriptions or change-event emitters feeding the inbox live stream are fully intact.
  - Ensure window/tab focus event hacks (`window.addEventListener('focus', ...)`) are not used as substitutes for live socket or event-stream connections.
- **Sync Pipeline Health:**
  - Verify sync handlers: test both the background cron/scheduler engine and the manual trigger API endpoints.
  - Ensure local SQL transactions commit properly and payload schemas match specifications.
- **WhatsApp Baileys Socket Lifecycle:**
  - Run integration smoke checks confirming session credentials persistence, event listener attachments (`connection.update`, `messages.upsert`), and auto-reconnect backoff logic.
- **AI Triage & Purge Filters:**
  - Run unit tests against the exclusion rules engine and purge queries to ensure no rules or SQL clean-up queries were bypassed or deleted during refactoring.
- **Standard Quality Gates:**
  - Must pass full TypeScript build verification (`npm run build` / `next build`) with zero type errors.
  - Must pass linter checks (`npm run lint`).
  - Verify all local SQL migrations, connection pools, and queries execute without syntax or constraint errors.

---

## Agent Hierarchy & Model Allocation

### 1. Mastermind Agent (Architect & Strategic Planner)
- **Assigned Model:** `Gemini 4 Argon Medium`
- **Fallback Model:** `Gemini 3.8 Flash High` (switches immediately if limits or quotas are hit)
- **Role & Responsibilities:**
  - Lead architectural design, system boundaries, and end-to-end user workflows.
  - Formulate robust strategies for local SQL schemas, connection pooling, local Auth, live event streaming (WebSocket / SSE), WhatsApp Baileys bridge, IMAP/SMTP sync engine, and Gemini AI triage.
  - Review failures and technical debt from previous iterations (`E:\VSC Projects\personal-assistant`) and ensure clean, async, enterprise-grade architecture.
  - Present architectural plans to the user for explicit approval.
  - After user plan approval, formulate granular, highly-detailed step-by-step specifications for subagents.
  - Enforce the 5 Non-Negotiable Invariants on all planned implementations.
  - Inspect, review, and verify test results, linting, git diffs, and build integrity before declaring tasks complete.

### 2. Subagent (Implementation & Execution Developer)
- **Assigned Model:** `Gemini 3.8 Flash Medium`
- **Role & Responsibilities:**
  - Strictly follow the approved step-by-step implementation specifications provided by the Mastermind Agent.
  - Implement Next.js App Router components, API routes, local SQL client/pool utilities, background workers, and UI modules.
  - Ensure zero synchronous database bottlenecks and manage connections cleanly with proper async pools and parameterization.
  - Execute the **Automated Verification & Pre-Flight Enforcement** checks prior to completing any work.
  - Perform type checks, lint checks, and unit/integration verifications (`next build`, `npm run lint`).
  - Report execution results, verification logs, and invariant pass/fail statuses back to the Mastermind Agent.