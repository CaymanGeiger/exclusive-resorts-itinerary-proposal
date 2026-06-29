"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  Car,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Flower2,
  Loader2,
  MailCheck,
  Plus,
  Sailboat,
  Save,
  Send,
  Sunset,
  Trash2,
  Utensils,
  Users,
  Waves,
  X,
} from "lucide-react";
import { CATEGORIES, defaultsFor } from "@/lib/categories";
import { dateRange, dateTime, money } from "@/lib/format";
import { proposalHref } from "@/lib/proposal-link";
import type {
  ItineraryCategory,
  ProposalDetail,
  ProposalDraftInput,
  ProposalItemInput,
  ProposalStatus,
  ProposalSummary,
  ReservationContext,
} from "@/lib/types";

type DraftItem = ProposalItemInput & { localId: string };

const iconMap = {
  Dining: Utensils,
  Activities: Waves,
  Wellness: Flower2,
  Excursions: Sailboat,
  Transport: Car,
  Experiences: Sunset,
};

const statusClass: Record<ProposalStatus, string> = {
  draft: "border-stone-300 bg-stone-100 text-stone-700",
  sent: "border-sky-200 bg-sky-50 text-sky-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  paid: "border-amber-200 bg-amber-50 text-amber-800",
};

function id() {
  return crypto.randomUUID();
}

const categoryDayOffset: Record<ItineraryCategory, number> = {
  Transport: 0,
  Dining: 1,
  Activities: 2,
  Wellness: 3,
  Excursions: 4,
  Experiences: 5,
};

function dateTimeForReservation(
  reservation: ReservationContext | null,
  category: ItineraryCategory,
  fallback: string,
) {
  if (!reservation) return fallback;
  const day = new Date(`${reservation.arrivalDate}T12:00:00`);
  day.setDate(day.getDate() + categoryDayOffset[category]);
  return `${day.toISOString().slice(0, 10)}T${fallback.slice(11)}`;
}

function noteFor(reservation: ReservationContext | null) {
  if (!reservation) {
    return "We selected a relaxed sequence of dining, wellness, and private experiences so the stay feels effortless from arrival to departure.";
  }
  const firstName = reservation.member.name.split(" ")[0] ?? reservation.member.name;
  return `${firstName}, we selected a relaxed sequence of dining, wellness, and private experiences in ${reservation.destination} so the stay feels effortless from arrival to departure.`;
}

function newDraftItem(
  category: ItineraryCategory,
  reservation: ReservationContext | null,
): DraftItem {
  const defaults = defaultsFor(category);
  return {
    localId: id(),
    category,
    title: defaults.title,
    description: defaults.description,
    scheduledAt: dateTimeForReservation(reservation, category, defaults.scheduledAt),
    price: defaults.price,
  };
}

function itemPayload(item: DraftItem): ProposalItemInput {
  return {
    category: item.category,
    title: item.title,
    description: item.description,
    scheduledAt: item.scheduledAt,
    price: item.price,
  };
}

function itemsFromProposal(proposal: ProposalDetail): DraftItem[] {
  return proposal.items.map((item) => ({
    localId: id(),
    category: item.category,
    title: item.title,
    description: item.description,
    scheduledAt: item.scheduledAt,
    price: item.price,
  }));
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}

export function ConciergeDashboard({
  initialReservations,
  initialProposals,
}: {
  initialReservations: ReservationContext[];
  initialProposals: ProposalSummary[];
}) {
  const [reservations] = useState(initialReservations);
  const [selectedReservationId, setSelectedReservationId] = useState(
    initialReservations[0]?.id ?? 0,
  );
  const [proposals, setProposals] = useState(initialProposals);
  const reservation =
    reservations.find((item) => item.id === selectedReservationId) ?? null;
  const [current, setCurrent] = useState<DraftItem>(() =>
    newDraftItem("Dining", initialReservations[0] ?? null),
  );
  const [items, setItems] = useState<DraftItem[]>([]);
  const [note, setNote] = useState(() => noteFor(initialReservations[0] ?? null));
  const [editingProposalId, setEditingProposalId] = useState<number | null>(null);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastProposal, setLastProposal] = useState<ProposalDetail | null>(null);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.price || 0), 0),
    [items],
  );

  const visibleProposals = useMemo(
    () =>
      reservation
        ? proposals.filter((proposal) => proposal.reservationId === reservation.id)
        : proposals,
    [proposals, reservation],
  );

  async function refreshProposals() {
    const data = await readJson<{ proposals: ProposalSummary[] }>(
      await fetch("/api/proposals", { cache: "no-store" }),
    );
    setProposals(data.proposals);
  }

  function resetBuilder(nextReservation: ReservationContext | null) {
    setEditingProposalId(null);
    setItems([]);
    setNote(noteFor(nextReservation));
    setCurrent(newDraftItem("Dining", nextReservation));
  }

  function selectReservation(id: number) {
    const nextReservation = reservations.find((item) => item.id === id) ?? null;
    setSelectedReservationId(id);
    setMessage(null);
    setError(null);
    resetBuilder(nextReservation);
  }

  function addItem() {
    setError(null);
    if (!current.title.trim() || !current.description.trim() || !current.scheduledAt) {
      setError("Add title, description, and date/time before adding the item.");
      return;
    }
    setItems((existing) => [...existing, { ...current, localId: id() }]);
    setCurrent(newDraftItem(current.category, reservation));
  }

  function draftPayload(): ProposalDraftInput {
    if (!reservation) throw new Error("Reservation has not loaded.");
    if (items.length === 0) throw new Error("Add at least one itinerary item.");
    return {
      reservationId: reservation.id,
      note,
      items: items.map(itemPayload),
    };
  }

  async function createDraft() {
    const payload = draftPayload();
    const data = await readJson<{ proposal: ProposalDetail }>(
      await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    return data.proposal;
  }

  async function updateDraft(id: number) {
    const payload = draftPayload();
    const data = await readJson<{ proposal: ProposalDetail }>(
      await fetch(`/api/proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    return data.proposal;
  }

  async function persistDraft() {
    return editingProposalId ? updateDraft(editingProposalId) : createDraft();
  }

  async function loadDraft(proposalId: number) {
    setBusy("draft");
    setError(null);
    setMessage(null);
    try {
      const data = await readJson<{ proposal: ProposalDetail }>(
        await fetch(`/api/proposals/${proposalId}`, { cache: "no-store" }),
      );
      if (data.proposal.status !== "draft") {
        throw new Error("Only draft proposals can be edited.");
      }
      setSelectedReservationId(data.proposal.reservationId);
      setEditingProposalId(data.proposal.id);
      setItems(itemsFromProposal(data.proposal));
      setNote(
        data.proposal.note ??
          noteFor({ ...data.proposal.reservation, member: data.proposal.member }),
      );
      setCurrent(
        newDraftItem("Dining", {
          ...data.proposal.reservation,
          member: data.proposal.member,
        }),
      );
      setLastProposal(data.proposal);
      setMessage(`Draft #${data.proposal.id} loaded for editing.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load draft.");
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    setBusy("draft");
    setError(null);
    setMessage(null);
    try {
      const proposal = await persistDraft();
      setEditingProposalId(proposal.id);
      setLastProposal(proposal);
      setMessage(
        editingProposalId ? `Draft #${proposal.id} changes saved.` : `Draft #${proposal.id} saved.`,
      );
      await refreshProposals();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save draft.");
    } finally {
      setBusy(null);
    }
  }

  async function sendProposal() {
    setBusy("send");
    setError(null);
    setMessage(null);
    try {
      const draft = await persistDraft();
      const data = await readJson<{ proposal: ProposalDetail }>(
        await fetch(`/api/proposals/${draft.id}/send`, { method: "POST" }),
      );
      setEditingProposalId(null);
      setLastProposal(data.proposal);
      setMessage(`Proposal #${data.proposal.id} sent to ${data.proposal.member.email}.`);
      resetBuilder(reservation);
      await refreshProposals();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send proposal.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7f2] text-[#17211c]">
      <header className="border-b border-[#dfe5dd] bg-white">
        <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
          <p className="text-sm font-semibold uppercase text-[#6f8a74]">
            Exclusive Resorts
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[#17344a]">
            Concierge Itinerary Proposal System
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
        {reservation ? (
          <section className="border border-[#dfe5dd] bg-white p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase text-[#6f8a74]">
                  Active reservation
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-[#17344a]">
                  {reservation.member.name}
                </h2>
              </div>
              {reservations.length > 1 ? (
                <label className="flex items-center gap-2 text-sm font-medium text-[#17344a]">
                  <Users className="h-4 w-4 text-[#b38a41]" />
                  <span>Reservation</span>
                  <select
                    value={selectedReservationId}
                    onChange={(event) => selectReservation(Number(event.target.value))}
                    className="h-11 min-w-64 rounded-md border border-[#dfe5dd] bg-white px-3 text-sm"
                  >
                    {reservations.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.member.name} - {item.destination}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="mt-5 grid gap-4 border-t border-[#dfe5dd] pt-5 lg:grid-cols-4">
              <TripFact label="Member" value={reservation.member.name} sub={reservation.member.email} />
              <TripFact label="Destination" value={reservation.destination} />
              <TripFact label="Villa" value={reservation.villa} />
              <TripFact
                label="Dates"
                value={dateRange(reservation.arrivalDate, reservation.departureDate)}
              />
            </div>
          </section>
        ) : null}

        {(message || error) && (
          <div
            className={`mt-5 border p-4 text-sm ${
              error
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>{error ?? message}</span>
              {lastProposal ? (
                <Link href={proposalHref(lastProposal)} className="inline-flex items-center gap-2 font-semibold">
                  Open member view <ExternalLink className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr_360px]">
          <section className="border border-[#dfe5dd] bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-[#17344a]">
                  {editingProposalId ? `Edit draft #${editingProposalId}` : "Build proposal"}
                </h2>
                {editingProposalId ? (
                  <p className="mt-1 text-sm text-[#69746e]">
                    Changes save back to this draft before sending.
                  </p>
                ) : null}
              </div>
              {editingProposalId ? (
                <button
                  type="button"
                  onClick={() => resetBuilder(reservation)}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#dfe5dd] px-3 text-sm font-semibold text-[#17344a]"
                >
                  <X className="h-4 w-4" /> Cancel
                </button>
              ) : null}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CATEGORIES.map((category) => {
                const Icon = iconMap[category.name];
                return (
                  <button
                    key={category.name}
                    type="button"
                    onClick={() => setCurrent(newDraftItem(category.name, reservation))}
                    className={`min-h-24 rounded-md border p-3 text-left ${
                      current.category === category.name
                        ? "border-[#b38a41] bg-[#fffaf0]"
                        : "border-[#dfe5dd]"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-semibold text-[#17344a]">
                      <Icon className="h-4 w-4 text-[#b38a41]" /> {category.name}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-[#69746e]">
                      {category.examples}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 space-y-4">
              <Field label="Title">
                <input
                  value={current.title}
                  onChange={(event) => setCurrent({ ...current, title: event.target.value })}
                  className="h-11 w-full rounded-md border border-[#dfe5dd] px-3 text-sm"
                />
              </Field>
              <Field label="Description">
                <textarea
                  value={current.description}
                  onChange={(event) =>
                    setCurrent({ ...current, description: event.target.value })
                  }
                  rows={4}
                  className="w-full resize-none rounded-md border border-[#dfe5dd] px-3 py-2 text-sm"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date and time">
                  <input
                    type="datetime-local"
                    value={current.scheduledAt}
                    onChange={(event) =>
                      setCurrent({ ...current, scheduledAt: event.target.value })
                    }
                    className="h-11 w-full rounded-md border border-[#dfe5dd] px-3 text-sm"
                  />
                </Field>
                <Field label="Estimated price">
                  <input
                    type="number"
                    min="0"
                    value={current.price}
                    onChange={(event) =>
                      setCurrent({ ...current, price: Number(event.target.value) })
                    }
                    className="h-11 w-full rounded-md border border-[#dfe5dd] px-3 text-sm"
                  />
                </Field>
              </div>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#17344a] text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" /> Add line item
              </button>
            </div>
          </section>

          <section className="border border-[#dfe5dd] bg-white p-5">
            <h2 className="text-xl font-semibold text-[#17344a]">Proposal preview</h2>
            <Field label="Concierge note">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                className="w-full resize-none rounded-md border border-[#dfe5dd] px-3 py-2 text-sm"
              />
            </Field>
            <div className="mt-5 space-y-3">
              {items.length === 0 ? (
                <p className="border border-dashed border-[#dfe5dd] p-8 text-center text-sm text-[#69746e]">
                  Added line items will appear here.
                </p>
              ) : (
                items.map((item) => (
                  <article key={item.localId} className="border border-[#dfe5dd] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase text-[#6f8a74]">
                          {item.category}
                        </p>
                        <h3 className="mt-1 font-semibold text-[#17344a]">{item.title}</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setItems((existing) =>
                            existing.filter((candidate) => candidate.localId !== item.localId),
                          )
                        }
                        aria-label={`Remove ${item.title}`}
                        className="rounded-md border border-[#dfe5dd] p-2"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#69746e]">{item.description}</p>
                    <p className="mt-3 text-sm text-[#17344a]">
                      <CalendarDays className="mr-2 inline h-4 w-4" />
                      {dateTime(item.scheduledAt)} · {money(item.price)}
                    </p>
                  </article>
                ))
              )}
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-[#dfe5dd] pt-5">
              <span className="text-sm text-[#69746e]">Estimated total</span>
              <span className="text-2xl font-semibold text-[#17344a]">{money(total)}</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={saveDraft}
                disabled={busy !== null || items.length === 0}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#dfe5dd] font-semibold text-[#17344a] disabled:opacity-50"
              >
                {busy === "draft" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {busy === "draft"
                  ? "Saving..."
                  : editingProposalId
                    ? "Save changes"
                    : "Save draft"}
              </button>
              <button
                type="button"
                onClick={sendProposal}
                disabled={busy !== null || items.length === 0}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#b38a41] font-semibold text-white disabled:opacity-50"
              >
                {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {editingProposalId ? "Send draft" : "Send proposal"}
              </button>
            </div>
          </section>

          <aside className="border border-[#dfe5dd] bg-white p-5">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-[#17344a]">
              <MailCheck className="h-5 w-5 text-[#b38a41]" /> Proposal ledger
            </h2>
            <div className="mt-5 space-y-3">
              {visibleProposals.length === 0 ? (
                <p className="border border-dashed border-[#dfe5dd] p-5 text-sm text-[#69746e]">
                  Proposals for this reservation will appear here.
                </p>
              ) : (
                visibleProposals.map((proposal) => (
                  <article
                    key={proposal.id}
                    className={`border p-4 ${
                      editingProposalId === proposal.id
                        ? "border-[#b38a41] bg-[#fffaf0]"
                        : "border-[#dfe5dd]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#17344a]">Proposal #{proposal.id}</p>
                        <p className="text-sm text-[#69746e]">
                          {proposal.itemCount} items · {money(proposal.total)}
                        </p>
                      </div>
                      <Status status={proposal.status} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {proposal.status === "draft" ? (
                        <button
                          type="button"
                          onClick={() => loadDraft(proposal.id)}
                          disabled={busy !== null}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-[#17344a] disabled:opacity-50"
                        >
                          <Edit3 className="h-4 w-4" /> Edit draft
                        </button>
                      ) : null}
                      <Link
                        href={`/proposal/${proposal.id}`}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-[#17344a]"
                      >
                        Member view <ExternalLink className="h-4 w-4" />
                      </Link>
                    </div>
                  </article>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function TripFact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-sm text-[#69746e]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[#17344a]">{value}</p>
      {sub ? <p className="text-sm text-[#69746e]">{sub}</p> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[#17344a]">{label}</span>
      {children}
    </label>
  );
}

function Status({ status }: { status: ProposalStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold capitalize ${statusClass[status]}`}
    >
      {status === "paid" ? <CheckCircle2 className="h-3 w-3" /> : null}
      {status}
    </span>
  );
}
