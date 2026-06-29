# Exclusive Resorts Itinerary Proposal System

A lightweight full-stack assessment app for building, sending, approving, and paying for a concierge itinerary proposal.

## Run Locally

```bash
npm install
npm run dev
```

Or as one command:

```bash
npm install && npm run dev
```

Open [http://localhost:3015](http://localhost:3015).

The SQLite database is created and seeded automatically on first request at `data/exclusive-resorts.sqlite`.

For Vercel deployments, the app defaults SQLite to `/tmp/exclusive-resorts.sqlite`
so serverless functions can write to it on the free plan. That is appropriate for
an assessment demo, but it is not durable production storage. A production version
should use a hosted database such as Turso or Neon.

## What It Does

- Concierge dashboard at `/`
  - Shows the active member reservation context.
  - Supports switching between seeded members/reservations.
  - Builds itinerary line items from the required categories.
  - Shows a live proposal preview and estimated total.
  - Saves drafts, reloads draft proposals for editing, and sends the edited draft.
  - Sending marks the proposal as `sent` and writes a row to `sent_emails`.
  - Lists proposals with `draft`, `sent`, `approved`, and `paid` statuses.

- Member experience at `/proposal/[id]`
  - Presents the itinerary with a premium Punta Mita visual treatment.
  - Renders the concierge note/message.
  - Groups line items into a day-by-day timeline.
  - Shows pricing and total cost clearly.
  - Optimistically updates approval and payment status.
  - Shows animated confirmation states after approval and payment.

## API Routes

- `GET /api/reservations`
- `POST /api/proposals`
- `GET /api/proposals`
- `GET /api/proposals/[id]`
- `PATCH /api/proposals/[id]`
- `POST /api/proposals/[id]/send`

Status changes are intentionally constrained to the proposal workflow:
`draft -> sent -> approved -> paid`. Sending is the only transition that writes
to `sent_emails`, and invalid jumps return `409 Conflict`.

## Optional Real Email Delivery

The assessment only requires simulated email, but the send route can also deliver
through Resend when server-side env vars are present:

- `RESEND_API_KEY`
- `PROPOSAL_FROM_EMAIL`
- `PROPOSAL_EMAIL_TO_OVERRIDE` (optional; useful because seeded member emails are fake)
- `PROPOSAL_BASE_URL` (optional; defaults to the current request origin)

Secrets should live in `.env.local`, which is ignored by git. If
`RESEND_API_KEY` is missing, sending still marks the proposal as sent and keeps
the local `sent_emails` audit row.

Copy `.env.example` to `.env.local` for local setup. Never commit `.env.local`.

## Tech Choices

- Next.js App Router with TypeScript.
- Tailwind CSS for all styling.
- `better-sqlite3` for a small, direct SQLite persistence layer.
- Lucide icons for button and category affordances.
- A local generated bitmap image in `public/punta-mita-coast.png` so the member route has a visual asset without depending on remote media.

## Assumptions

- The assessment dates are treated as March 15-22, 2026 because the assessment PDF was created in February 2026.
- James Whitfield's required reservation is seeded, along with two additional reservations to demonstrate the stretch multi-member workflow.
- Prices are stored as dollar values in SQLite for readability in this small assessment.
- Simulated payment is represented by a `paid` status transition only.
- Simulated email is represented by a console log and a `sent_emails` row; Resend
  delivery is enabled locally only when private env vars are configured.
- Drafts can be previewed, but member approval/payment actions stay disabled until
  the proposal has been sent.

## What I Would Improve With More Time

- Add automated route-handler tests around validation and status transitions.
- Add authentication and role-aware access controls.
- Replace simulated email/payment with real providers in a production version.
- Add more detailed audit history for every status change.

## Most Interesting Part

The useful product tension is that the concierge view and member view should not feel like the same app skin. The concierge needs dense, fast, low-friction controls. The member needs confidence, elegance, clear pricing, and a simple approval path. I kept those surfaces visually distinct while sharing the same normalized proposal data.

## Walkthrough Notes

For a 5-10 minute Loom:

1. Start on the concierge dashboard and point out the seeded reservation context.
2. Switch reservations to show the multi-member stretch workflow.
3. Add one or more itinerary items from different categories.
4. Save a draft, reopen it from the ledger, edit it, and send it.
5. Show the preview total and concierge note.
6. Open the member proposal link.
7. Approve the proposal and point out the optimistic animated confirmation.
8. Pay and lock it in.
9. Return to the dashboard and show the status changed to `paid`.
