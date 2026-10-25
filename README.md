# Encore

**Find your artists. Catch the moment. Go together.**

A mobile-first music and concert discovery app. It imports your top artists from Spotify, lets you curate a fan list, watches official ticket providers for concerts and sale dates near you, and lets accepted friends see shared artists and coordinate plans.

This repository implements the **Phase 1 foundation** of the product spec (v0.2), with the social data model, access control and core social flows already in place.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, TypeScript, Server Actions), Tailwind CSS v4 |
| Data | Supabase Postgres with row-level security on every table |
| Auth | Supabase Auth with Spotify OAuth (authorisation code + PKCE) |
| Jobs | Daily Vercel cron for data, `pg_cron` every 5 min for reminder delivery, or `pnpm worker` locally; all state in Postgres |
| Tests | Vitest (unit) and pgTAP (database access control and pipelines) |

## Getting started

Prerequisites: Node 22+, pnpm 10, Docker (for local Supabase).

```bash
pnpm install
cp .env.example .env.local        # then fill in the values (see below)
pnpm db:start                     # local Postgres, Auth and API in Docker; applies migrations
pnpm dev                          # http://127.0.0.1:3000
pnpm worker                       # background jobs, in a second terminal
```

`pnpm exec supabase status` prints the local `PUBLISHABLE_KEY` and `SECRET_KEY` for `.env.local`.

### Spotify sign-in

1. Create an app in the [Spotify developer dashboard](https://developer.spotify.com/dashboard).
2. Add the redirect URI `http://127.0.0.1:54321/auth/v1/callback`. Spotify rejects `localhost`.
3. Put `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env.local`, **and** export them (or place them in `supabase/.env`) before `pnpm db:start`, because `supabase/config.toml` reads them for the Auth provider.
4. Apps in Spotify development mode only work for users you add in the dashboard. Broader access requires Spotify's quota extension review.

### Ticketmaster

Set `TICKETMASTER_API_KEY`. Without it, the event jobs log `skipped` and the app shows explicit "no concerts yet" states. Nothing is faked.

### Without any provider keys

`pnpm dev:fixtures` (local Supabase only; it refuses any other URL) creates two test accounts and pushes Ticketmaster-shaped payloads through the real pipeline: normaliser → `ingest_provider_event` → notification scheduling → delivery. Use it to exercise every screen. It is never imported by the app.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm check` | Typecheck + lint + unit tests |
| `pnpm test` | Vitest unit tests |
| `pnpm db:test` | pgTAP: RLS, privilege and pipeline tests against the local database |
| `pnpm db:reset` | Recreate the local database from migrations |
| `pnpm db:types` | Regenerate `src/lib/database.types.ts` from the local schema |
| `pnpm worker` / `worker:once` | Run background jobs continuously or once (`--job=<name>` for one job, e.g. `--job=concert-search`) |

## Architecture

```
src/
  app/                     routes (App Router)
    (app)/                 authenticated screens: discover, artists, friends, saved, profile, events, notifications
    onboarding/            five-step first-run flow
    auth/callback/         OAuth callback: stores encrypted Spotify tokens server-side
    api/cron/[job]/        authenticated hosted-cron entry point
  components/              shared design-system components
  lib/                     pure, client-safe logic: events, ranking, formatting, env, types
  server/
    actions/               server actions (session re-verified, input validated with zod)
    data/                  per-user read models (RLS-scoped queries)
    providers/             provider adapter contract, Ticketmaster client + normaliser, artist matching
    spotify/               Spotify API client and sync
    notifications/         pure delivery decision, delivery, Web Push
    jobs/                  job registry and runner (logs to job_runs)
supabase/
  migrations/              schema, RLS/grants/social RPCs, pipelines, reference cities
  tests/database/          pgTAP tests
scripts/                   worker and local fixtures
tests/                     unit tests
```

### Key design decisions

- **Provider writes are server-only.** Clients can read the catalogue (artists, events, sales, offers) but cannot write it. Ingestion, Spotify import and notification scheduling are `security definer` SQL functions that only `service_role` may execute. They are transactional and idempotent, so retries never duplicate artists, events or notifications.
- **Lifecycle and sale phases are separate.** `events.lifecycle_status` holds the provider status. Sale phases live in `event_sales` and ticket categories in `ticket_offers`. The UI derives "presale scheduled", "on sale" and so on (`src/lib/events.ts`).
- **Conservative deduplication.** Artists match by provider ID; Ticketmaster attractions link to Spotify artists through Spotify URLs on the attraction. A unique exact-name match is accepted at confidence 0.7, below the 0.9 alert threshold, so it is displayed and labelled but never triggers alerts. VIP/package listings with the same venue, exact start time and artist attach to the existing concert as extra offers.
- **Notifications are revalidated.** Jobs carry a deduplication key and a snapshot of the sale start. At delivery time `decide()` re-checks event status, sale time, preferences, friendship and quiet hours. Stale reminders are cancelled when an event changes. Time-critical alerts during quiet hours go to the inbox without push; others are deferred.
- **Privacy by default.** Social visibility defaults to accepted friends. Every social read goes through RLS or a `security definer` RPC that checks friendship, visibility and blocks. Blocking overrides everything. Tokens are AES-256-GCM encrypted, and their columns are not even selectable by the owner's client.
- **Transparent ranking.** `src/lib/ranking.ts` is rules-based, and every point carries a human-readable reason. Cancelled, postponed and stale events always sink. Affiliate status is not an input.

### Deviations from spec v0.2

- `text-muted` is lightened from `#897C7D` to `#9C8E8F`: the original measured 4.16:1 on `surface` and 3.54:1 on `surface-elevated`, below WCAG AA. A `border-strong` token (`#857579`) is added for 3:1 control boundaries. `tests/foundation.test.ts` verifies every pair.
- The home location is modelled with `users.home_location_id` → `user_locations` → reference `cities`. No precise coordinates are ever stored for users.
- Removing an artist sets `user_artists.is_dismissed` instead of deleting the row, so the weekly Spotify import does not silently re-add it. The canonical artist is untouched.

## Deployment

1. Create a Supabase project, run `supabase link` and `supabase db push`, and enable the Spotify provider in Auth (same client ID/secret; add the hosted callback URL in Spotify).
2. Deploy the Next.js app (e.g. Vercel) with all variables from `.env.example`. Set `NEXT_PUBLIC_APP_URL` to the public URL and add `<app-url>/auth/callback` to Supabase Auth → URL configuration → redirect URLs.
3. Scheduling (works on the free Vercel Hobby plan):
   - **Data, once a day:** `vercel.json` runs `/api/cron/daily` at 05:00 UTC. It runs the weekly Spotify sync for accounts that are due, matches new artists on Ticketmaster, refreshes concert lists (one request per artist), delivers anything already due and cleans up, all within a 270 s budget. Work that doesn't fit is picked up the next day, oldest first.
   - **Right after a Spotify import**, the same concert search runs for the new artists via `after()`, so new users don't wait for the next daily run.
   - **Reminders, every 5 minutes:** Postgres (`pg_cron` + `pg_net`) calls `/api/cron/notifications-deliver`, which only delivers reminders that were already scheduled. It needs two Vault secrets, set once in the Supabase SQL editor:
     ```sql
     select vault.create_secret('https://<your-app>.vercel.app', 'encore_app_url');
     select vault.create_secret('<same value as CRON_SECRET>', 'encore_cron_secret');
     ```
     Without them the trigger does nothing (local development uses `pnpm worker` instead).
   - Alternatively, run a long-running `pnpm worker` on any Node host.

Jobs are safe to run concurrently or retry: claims use `FOR UPDATE SKIP LOCKED` leases and every write is idempotent. Failed runs are recorded in `job_runs`.

## Not yet done

- Ticket availability (sold out / few left): the Discovery API has no such field, and Ticketmaster's Inventory Status API rejects standard keys ("Invalid ApiKey for given resource"). It needs partner access from Ticketmaster; Encore only shows the provider's "off sale" status until then.

- **Spotify and Ticketmaster against live APIs.** Both integrations are implemented against the documented APIs, but no real credentials were available while building, so neither has been exercised live. Spotify development-mode and quota restrictions change over time; check the current Web API policies before launch.
- Song previews come from Deezer's public API (popular tracks + 30-second previews), because Spotify no longer offers top tracks or preview URLs to development-mode apps. Audio streams from Deezer and is never stored. **Review Deezer's API terms for commercial use before a public launch.**
- Phase 2/3 items: companion invitations ("Ask to join"), reporting, artist swipe discovery, EVENTIM adapter, affiliate links.
- Legal: `/legal` holds draft product notes and must be replaced by a reviewed privacy policy, imprint and terms before public launch.
- Native push reliability differs per platform: iOS supports Web Push only for installed PWAs. The in-app inbox is always the source of truth.
