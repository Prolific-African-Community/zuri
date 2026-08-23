# Zuri

Technical foundation for a multi-brand Growth OS, built with Next.js App Router,
strict TypeScript, PostgreSQL, Prisma, Tailwind CSS, and ESLint.

## Local setup

1. Copy `.env.example` to `.env` and configure a PostgreSQL connection.
2. Run `npm install`.
3. Run `npm run db:migrate -- --name init`.
4. Run `npm run db:seed`.
5. Run `npm run dev`.

The brand-management foundation lives under `/dashboard/brands`. Future engines
should be introduced as independent feature areas only when their scope is defined.
