# Zuri

A multi-brand Growth OS. Zuri keeps each brand's identity and market knowledge
separate and structured, then turns that knowledge into opportunities, content
and a weekly plan.

**Status: V1.** Every flow below works end to end against real services.
Access is protected by a single-admin password login; everything under
`/dashboard` requires a session. Nothing publishes on its own: Zuri drafts,
scores and schedules, a human decides.

## What it does

| Surface | What it does |
| --- | --- |
| Brands | Brand profile, audiences, voice rules, golden examples, competitors |
| Capture | Log market observations against a brand in seconds |
| Opportunities | Generate scored angles from a brand's own knowledge, then LinkedIn drafts and visuals |
| Content | Library of every draft: edit, approve, archive, schedule |
| Calendar | Everything with a date, week by week |
| Search | Site crawl, keyword research with live SERPs, SEO opportunities, briefs and content |
| Growth Week | At most five moves for the week, chosen from what already exists |

## Setup

```bash
npm install
cp .env.example .env   # then fill in the values below
npm run db:migrate
npm run db:seed
npm run dev
```

The app runs at http://localhost:3000.

## Environment variables

`.env.example` documents all of them. Required:

- `DATABASE_URL` — any PostgreSQL instance (Neon works as is).
- `OPENAI_API_KEY` — every generation feature needs it.
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob store, **public access**, for generated
  images. A private store rejects the upload.
- `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` — keyword and SERP data. The
  password is the API password generated at app.dataforseo.com/api-access, not
  the dashboard password, and the account must be verified.
- `AUTH_SECRET` / `AUTH_PASSWORD` — the admin login. `AUTH_SECRET` signs the
  session cookie; generate it with `openssl rand -base64 32`. If either is
  missing the app locks itself rather than opening up.

Optional: `OPENAI_MODEL`, `OPENAI_IMAGE_MODEL`, `DATAFORSEO_LOCATION_NAME`,
`DATAFORSEO_LANGUAGE_NAME`.

All three external services are called from Server Actions only. No key ever
reaches the browser.

## External services

| Service | Used for | Cost |
| --- | --- | --- |
| OpenAI | Opportunities, LinkedIn drafts, visual recommendations, images, SEO briefs and content, Growth Week | Per call |
| DataForSEO | Keyword metrics and live Google SERPs | Per call |
| Vercel Blob | Storing generated images | Storage |
| PostgreSQL | All application data | — |

Every generation is triggered by an explicit click, capped in size, and skipped
when the brand has too little data to work from.

## Commands

```bash
npm run dev         # development server
npm run build       # production build
npm run start       # serve the production build
npm run lint        # eslint, zero warnings allowed
npm run typecheck   # tsc --noEmit
npm run db:migrate  # prisma migrate dev
npm run db:seed     # seed the default workspace and the Proliquid brand
```

## Auth

One admin, one password. Signing in sets an HMAC-signed, HttpOnly session
cookie valid for 7 days. `proxy.ts` gates every `/dashboard` request, and each
Server Action re-checks the session on the server, so neither a direct POST nor
a forged cookie gets through. The landing page stays public. Rotating
`AUTH_SECRET` invalidates all existing sessions.

## Notes

- Prisma generates its client into `lib/generated/prisma`. Run
  `npx prisma generate` after changing the schema, and restart `next dev` so the
  server picks up the new client.
- The seed is idempotent and preserves anything written in the app.
