import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  ProposalDetail,
  ProposalDraftInput,
  ProposalItem,
  ProposalItemInput,
  ProposalStatus,
  ProposalSummary,
  ReservationContext,
} from "@/lib/types";

let db: Database.Database | null = null;

type ProposalMutationResult = {
  proposal: ProposalDetail | null;
  error?: string;
  status?: number;
};

const nextStatuses: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ["sent"],
  sent: ["approved"],
  approved: ["paid"],
  paid: [],
};

function getDatabasePath() {
  if (process.env.SQLITE_DATABASE_PATH) return process.env.SQLITE_DATABASE_PATH;
  if (process.env.VERCEL) return join("/tmp", "exclusive-resorts.sqlite");
  return join(process.cwd(), "data", "exclusive-resorts.sqlite");
}

export function getDb() {
  if (!db) {
    const file = getDatabasePath();
    mkdirSync(dirname(file), { recursive: true });
    db = new Database(file);
    db.pragma("foreign_keys = ON");
    db.pragma("journal_mode = WAL");
    migrate(db);
    seed(db);
  }
  return db;
}

function migrate(database: Database.Database) {
  database.exec(`
	    CREATE TABLE IF NOT EXISTS members (
	      id INTEGER PRIMARY KEY AUTOINCREMENT,
	      name TEXT NOT NULL,
	      email TEXT NOT NULL UNIQUE
	    );
	    CREATE TABLE IF NOT EXISTS reservations (
	      id INTEGER PRIMARY KEY AUTOINCREMENT,
	      member_id INTEGER NOT NULL,
	      destination TEXT NOT NULL,
	      villa TEXT NOT NULL,
	      arrival_date TEXT NOT NULL,
	      departure_date TEXT NOT NULL,
	      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
	    );
	    CREATE TABLE IF NOT EXISTS proposals (
	      id INTEGER PRIMARY KEY AUTOINCREMENT,
	      reservation_id INTEGER NOT NULL,
	      status TEXT NOT NULL DEFAULT 'draft'
	        CHECK (status IN ('draft', 'sent', 'approved', 'paid')),
	      note TEXT,
	      created_at TEXT NOT NULL DEFAULT (datetime('now')),
	      sent_at TEXT,
	      FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
	    );
	    CREATE TABLE IF NOT EXISTS proposal_items (
	      id INTEGER PRIMARY KEY AUTOINCREMENT,
	      proposal_id INTEGER NOT NULL,
	      category TEXT NOT NULL,
	      title TEXT NOT NULL,
	      description TEXT NOT NULL,
	      scheduled_at TEXT NOT NULL,
	      price REAL NOT NULL CHECK (price >= 0),
	      FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE
	    );
	    CREATE TABLE IF NOT EXISTS sent_emails (
	      id INTEGER PRIMARY KEY AUTOINCREMENT,
	      proposal_id INTEGER NOT NULL,
	      to_email TEXT NOT NULL,
	      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
	      body_preview TEXT NOT NULL,
	      FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE
	    );
	  `);
}

function seed(database: Database.Database) {
  const reservations = [
    {
      name: "James Whitfield",
      email: "james.whitfield@example.com",
      destination: "Punta Mita, Mexico",
      villa: "Villa Punta Mita",
      arrivalDate: "2026-03-15",
      departureDate: "2026-03-22",
    },
    {
      name: "Olivia Bennett",
      email: "olivia.bennett@example.com",
      destination: "Sea Island, Georgia",
      villa: "Cottage 312",
      arrivalDate: "2026-04-09",
      departureDate: "2026-04-14",
    },
    {
      name: "Priya Shah",
      email: "priya.shah@example.com",
      destination: "Los Cabos, Mexico",
      villa: "Casa del Mar",
      arrivalDate: "2026-05-03",
      departureDate: "2026-05-10",
    },
  ];

  const insert = database.transaction(() => {
    for (const reservation of reservations) {
      database
        .prepare("INSERT OR IGNORE INTO members (name, email) VALUES (?, ?)")
        .run(reservation.name, reservation.email);
      const member = database
        .prepare("SELECT id FROM members WHERE email = ?")
        .get(reservation.email) as { id: number };
      const exists = database
        .prepare(
          `SELECT id FROM reservations
           WHERE member_id = ? AND destination = ? AND villa = ?
             AND arrival_date = ? AND departure_date = ?`,
        )
        .get(
          member.id,
          reservation.destination,
          reservation.villa,
          reservation.arrivalDate,
          reservation.departureDate,
        );
      if (exists) continue;
      database
        .prepare(
          `INSERT INTO reservations
          (member_id, destination, villa, arrival_date, departure_date)
          VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          member.id,
          reservation.destination,
          reservation.villa,
          reservation.arrivalDate,
          reservation.departureDate,
        );
    }
  });
  insert();
}

function reservationFromRow(row: {
  id: number;
  member_id: number;
  destination: string;
  villa: string;
  arrival_date: string;
  departure_date: string;
  member_name: string;
  member_email: string;
}): ReservationContext {
  return {
    id: row.id,
    memberId: row.member_id,
    destination: row.destination,
    villa: row.villa,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    member: {
      id: row.member_id,
      name: row.member_name,
      email: row.member_email,
    },
  };
}

export function listReservations(): ReservationContext[] {
  const rows = getDb()
    .prepare(
      `SELECT r.*, m.name member_name, m.email member_email
       FROM reservations r JOIN members m ON m.id = r.member_id
       ORDER BY r.arrival_date, r.id`,
    )
    .all() as Array<Parameters<typeof reservationFromRow>[0]>;
  return rows.map(reservationFromRow);
}

export function getReservation(id?: number): ReservationContext | null {
  const row = getDb()
    .prepare(
      `SELECT r.*, m.name member_name, m.email member_email
       FROM reservations r JOIN members m ON m.id = r.member_id
       ${id ? "WHERE r.id = ?" : ""}
       ORDER BY r.arrival_date LIMIT 1`,
    )
    .get(...(id ? [id] : [])) as Parameters<typeof reservationFromRow>[0] | undefined;

  if (!row) return null;
  return reservationFromRow(row);
}

export function listProposals(): ProposalSummary[] {
  return getDb()
    .prepare(
      `SELECT p.id, p.reservation_id reservationId, p.status, p.note,
        p.created_at createdAt, p.sent_at sentAt,
        m.name memberName, m.email memberEmail,
        r.destination, r.villa, r.arrival_date arrivalDate, r.departure_date departureDate,
        COUNT(pi.id) itemCount, COALESCE(SUM(pi.price), 0) total
       FROM proposals p
       JOIN reservations r ON r.id = p.reservation_id
       JOIN members m ON m.id = r.member_id
       LEFT JOIN proposal_items pi ON pi.proposal_id = p.id
       GROUP BY p.id
       ORDER BY p.id DESC`,
    )
    .all() as ProposalSummary[];
}

export function getProposal(id: number): ProposalDetail | null {
  const row = getDb()
    .prepare(
      `SELECT p.*, r.member_id, r.destination, r.villa, r.arrival_date, r.departure_date,
        m.name member_name, m.email member_email
       FROM proposals p
       JOIN reservations r ON r.id = p.reservation_id
       JOIN members m ON m.id = r.member_id
       WHERE p.id = ?`,
    )
    .get(id) as
    | {
        id: number;
        reservation_id: number;
        status: ProposalStatus;
        note: string | null;
        created_at: string;
        sent_at: string | null;
        member_id: number;
        destination: string;
        villa: string;
        arrival_date: string;
        departure_date: string;
        member_name: string;
        member_email: string;
      }
    | undefined;

  if (!row) return null;

  const items = getDb()
    .prepare(
      `SELECT id, proposal_id proposalId, category, title, description,
        scheduled_at scheduledAt, price
       FROM proposal_items
       WHERE proposal_id = ?
       ORDER BY scheduled_at, id`,
    )
    .all(id) as ProposalItem[];

  const sentEmails = getDb()
    .prepare(
      `SELECT id, proposal_id proposalId, to_email toEmail, sent_at sentAt,
        body_preview bodyPreview
       FROM sent_emails WHERE proposal_id = ? ORDER BY id DESC`,
    )
    .all(id) as ProposalDetail["sentEmails"];

  return {
    id: row.id,
    reservationId: row.reservation_id,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    member: { id: row.member_id, name: row.member_name, email: row.member_email },
    reservation: {
      id: row.reservation_id,
      memberId: row.member_id,
      destination: row.destination,
      villa: row.villa,
      arrivalDate: row.arrival_date,
      departureDate: row.departure_date,
    },
    items,
    sentEmails,
    total: items.reduce((sum, item) => sum + item.price, 0),
  };
}

function writeProposalItems(proposalId: number, items: ProposalItemInput[]) {
  const insertItem = getDb().prepare(
    `INSERT INTO proposal_items
     (proposal_id, category, title, description, scheduled_at, price)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  items.forEach((item) =>
    insertItem.run(
      proposalId,
      item.category,
      item.title,
      item.description,
      item.scheduledAt,
      item.price,
    ),
  );
}

export function createProposal(input: ProposalDraftInput) {
  const id = getDb().transaction(() => {
    const proposal = getDb()
      .prepare("INSERT INTO proposals (reservation_id, note) VALUES (?, ?)")
      .run(input.reservationId, input.note);
    const proposalId = Number(proposal.lastInsertRowid);
    writeProposalItems(proposalId, input.items);
    return proposalId;
  })();
  return getProposal(id);
}

export function updateDraftProposal(id: number, input: ProposalDraftInput) {
  const updated = getDb().transaction(() => {
    const result = getDb()
      .prepare("UPDATE proposals SET reservation_id = ?, note = ? WHERE id = ? AND status = 'draft'")
      .run(input.reservationId, input.note, id);
    if (result.changes === 0) return false;
    getDb().prepare("DELETE FROM proposal_items WHERE proposal_id = ?").run(id);
    writeProposalItems(id, input.items);
    return true;
  })();
  return updated ? getProposal(id) : null;
}

function canTransition(from: ProposalStatus, to: ProposalStatus) {
  return from === to || nextStatuses[from].includes(to);
}

function transitionMessage(from: ProposalStatus, to: ProposalStatus) {
  return `Cannot move proposal from ${from} to ${to}. Expected next status is ${
    nextStatuses[from][0] ?? "none"
  }.`;
}

export function updateStatus(id: number, status: ProposalStatus): ProposalMutationResult {
  const existing = getProposal(id);
  if (!existing) return { proposal: null };

  if (!canTransition(existing.status, status)) {
    return {
      proposal: existing,
      error: transitionMessage(existing.status, status),
      status: 409,
    };
  }

  if (existing.status === status) {
    return { proposal: existing };
  }

  const sentAtSql =
    status === "sent" ? ", sent_at = COALESCE(sent_at, datetime('now'))" : "";
  const result = getDb()
    .prepare(`UPDATE proposals SET status = ?${sentAtSql} WHERE id = ? AND status = ?`)
    .run(status, id, existing.status);

  if (result.changes === 0) {
    return {
      proposal: getProposal(id),
      error: "Proposal status changed before this request completed.",
      status: 409,
    };
  }

  return { proposal: getProposal(id) };
}

export function sendProposal(id: number): ProposalMutationResult {
  const existing = getProposal(id);
  if (!existing) return { proposal: null };
  if (existing.status === "sent") return { proposal: existing };
  if (existing.status !== "draft") {
    return {
      proposal: existing,
      error: "Only draft proposals can be sent.",
      status: 409,
    };
  }

  const result = updateStatus(id, "sent");
  if (result.error || !result.proposal) return result;
  const proposal = result.proposal;

  const bodyPreview = [
    `${proposal.member.name}, your ${proposal.reservation.villa} proposal is ready`,
    `with ${proposal.items.length} curated items totaling`,
    `$${proposal.total.toLocaleString("en-US")}.`,
  ].join(" ");
  getDb()
    .prepare(
      "INSERT INTO sent_emails (proposal_id, to_email, body_preview) VALUES (?, ?, ?)",
    )
    .run(id, proposal.member.email, bodyPreview);
  console.log(`Simulated email sent to ${proposal.member.email}: ${bodyPreview}`);
  return { proposal: getProposal(id) };
}

export function validStatus(value: unknown): value is ProposalStatus {
  return value === "sent" || value === "approved" || value === "paid";
}
