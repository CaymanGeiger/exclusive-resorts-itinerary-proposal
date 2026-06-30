"use client";

import Link from "next/link";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronDown,
  Edit3,
  ExternalLink,
  Flower2,
  Loader2,
  MailCheck,
  MapPin,
  Plus,
  Sailboat,
  Save,
  Search,
  Send,
  Sunset,
  Trash2,
  Utensils,
  Users,
  Waves,
  X,
} from "lucide-react";
import { FlowStrip, type FlowStep } from "@/components/FlowStrip";
import { ProposalStatusBadge } from "@/components/ProposalStatusBadge";
import { Calendar as ShadcnCalendar } from "@/components/ui/calendar";
import { readJson } from "@/lib/api";
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
type ConciergeFlowStepId = "draft" | "review" | "sent";
type BusyState = "draft" | "send" | null;
type ProposalHistoryFilter = ProposalStatus | "all";

const iconMap = {
  Dining: Utensils,
  Activities: Waves,
  Wellness: Flower2,
  Excursions: Sailboat,
  Transport: Car,
  Experiences: Sunset,
};

const proposalHistoryFilters: readonly {
  id: ProposalHistoryFilter;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "approved", label: "Approved" },
  { id: "paid", label: "Paid" },
];

const conciergeFlowSteps: readonly FlowStep<ConciergeFlowStepId>[] = [
  { id: "draft", label: "Draft" },
  { id: "review", label: "Review" },
  { id: "sent", label: "Sent" },
];

const datePickerFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

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

function localDateFromIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function isoDateFromLocalDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function scheduledDate(value: string) {
  return localDateFromIsoDate(value.slice(0, 10));
}

function scheduledTime(value: string) {
  return value.slice(11, 16) || "09:00";
}

function scheduledAtFor(datePart: string, timePart: string) {
  return `${datePart}T${timePart || "09:00"}`;
}

function isDateWithinReservation(date: Date, reservation: ReservationContext | null) {
  if (!reservation) return true;
  const isoDate = isoDateFromLocalDate(date);
  return isoDate >= reservation.arrivalDate && isoDate <= reservation.departureDate;
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

function reservationContextFromProposal(proposal: ProposalDetail): ReservationContext {
  return {
    ...proposal.reservation,
    member: proposal.member,
  };
}

function isDraftItemComplete(item: DraftItem) {
  return (
    item.title.trim().length > 0 &&
    item.description.trim().length > 0 &&
    item.scheduledAt.length > 0 &&
    Number.isFinite(item.price) &&
    item.price >= 0
  );
}

function draftPayloadFor(
  reservation: ReservationContext | null,
  note: string | null,
  items: DraftItem[],
): ProposalDraftInput {
  if (!reservation) throw new Error("Reservation has not loaded.");
  if (items.length === 0) throw new Error("Add at least one itinerary item.");
  return {
    reservationId: reservation.id,
    note,
    items: items.map(itemPayload),
  };
}

function workspaceTitleFor({
  step,
  editingProposalId,
  lastProposal,
}: {
  step: ConciergeFlowStepId;
  editingProposalId: number | null;
  lastProposal: ProposalDetail | null;
}) {
  if (step === "sent" && lastProposal) return `Proposal #${lastProposal.id} sent`;
  if (step === "review" && editingProposalId) return `Review draft #${editingProposalId}`;
  if (editingProposalId) return `Draft #${editingProposalId}`;
  return "New proposal";
}

function proposalHistorySearchText(proposal: ProposalSummary) {
  return [
    `proposal ${proposal.id}`,
    `#${proposal.id}`,
    proposal.status,
    proposal.villa,
    proposal.destination,
    dateRange(proposal.arrivalDate, proposal.departureDate),
    `${proposal.itemCount} items`,
    money(proposal.total),
  ]
    .join(" ")
    .toLowerCase();
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
  const [contextReservation, setContextReservation] =
    useState<ReservationContext | null>(initialReservations[0] ?? null);
  const [contextTextVisible, setContextTextVisible] = useState(true);
  const contextFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [proposals, setProposals] = useState(initialProposals);
  const reservation =
    reservations.find((item) => item.id === selectedReservationId) ?? null;
  const reservationContext = contextReservation ?? reservation;
  const reservationTextClass = `reservation-text-fade${
    contextTextVisible ? "" : " reservation-text-fade-out"
  }`;
  const [current, setCurrent] = useState<DraftItem>(() =>
    newDraftItem("Dining", initialReservations[0] ?? null),
  );
  const [items, setItems] = useState<DraftItem[]>([]);
  const [note, setNote] = useState(() => noteFor(initialReservations[0] ?? null));
  const [editingProposalId, setEditingProposalId] = useState<number | null>(null);
  const [workspaceStep, setWorkspaceStep] = useState<ConciergeFlowStepId>("draft");
  const [busy, setBusy] = useState<BusyState>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastProposal, setLastProposal] = useState<ProposalDetail | null>(null);
  const [isLineItemDialogOpen, setIsLineItemDialogOpen] = useState(false);
  const lineItemDialogRef = useRef<HTMLDialogElement | null>(null);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.price || 0), 0),
    [items],
  );
  const canAddCurrentItem = isDraftItemComplete(current);
  const workspaceTitle = workspaceTitleFor({
    step: workspaceStep,
    editingProposalId,
    lastProposal,
  });

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

  useEffect(() => {
    return () => {
      if (contextFadeTimer.current) clearTimeout(contextFadeTimer.current);
    };
  }, []);

  useEffect(() => {
    const dialog = lineItemDialogRef.current;
    if (!dialog) return;

    if (isLineItemDialogOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isLineItemDialogOpen && dialog.open) {
      dialog.close();
    }
  }, [isLineItemDialogOpen]);

  function transitionReservationContext(nextReservation: ReservationContext | null) {
    if ((contextReservation?.id ?? null) === (nextReservation?.id ?? null)) {
      setContextTextVisible(true);
      return;
    }

    if (contextFadeTimer.current) clearTimeout(contextFadeTimer.current);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setContextReservation(nextReservation);
      setContextTextVisible(true);
      return;
    }

    setContextTextVisible(false);
    contextFadeTimer.current = setTimeout(() => {
      setContextReservation(nextReservation);
      contextFadeTimer.current = null;
      requestAnimationFrame(() => setContextTextVisible(true));
    }, 70);
  }

  function resetBuilder(nextReservation: ReservationContext | null) {
    setEditingProposalId(null);
    setItems([]);
    setNote(noteFor(nextReservation));
    setCurrent(newDraftItem("Dining", nextReservation));
    setWorkspaceStep("draft");
    setLastProposal(null);
  }

  function selectReservation(id: number) {
    const nextReservation = reservations.find((item) => item.id === id) ?? null;
    if (id === selectedReservationId) return;

    setSelectedReservationId(id);
    setMessage(null);
    setError(null);
    transitionReservationContext(nextReservation);
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
    setIsLineItemDialogOpen(false);
  }

  function removeItem(localId: string) {
    setItems((existing) => existing.filter((item) => item.localId !== localId));
  }

  function draftPayload(): ProposalDraftInput {
    return draftPayloadFor(reservation, note, items);
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
      const draftReservation = reservationContextFromProposal(data.proposal);
      setSelectedReservationId(data.proposal.reservationId);
      transitionReservationContext(draftReservation);
      setEditingProposalId(data.proposal.id);
      setItems(itemsFromProposal(data.proposal));
      setNote(data.proposal.note ?? noteFor(draftReservation));
      setCurrent(newDraftItem("Dining", draftReservation));
      setLastProposal(data.proposal);
      setWorkspaceStep("draft");
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

  async function saveDraftAndReview() {
    setBusy("draft");
    setError(null);
    setMessage(null);
    try {
      const proposal = await persistDraft();
      setEditingProposalId(proposal.id);
      setLastProposal(proposal);
      setMessage(`Draft #${proposal.id} saved. Review it before sending.`);
      setWorkspaceStep("review");
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
      setItems(itemsFromProposal(data.proposal));
      setNote(data.proposal.note ?? noteFor(reservationContextFromProposal(data.proposal)));
      setWorkspaceStep("sent");
      setMessage(`Proposal #${data.proposal.id} sent to ${data.proposal.member.email}.`);
      await refreshProposals();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send proposal.");
    } finally {
      setBusy(null);
    }
  }

  function startAnotherProposal() {
    setMessage(null);
    setError(null);
    resetBuilder(reservation);
  }

  function backToDraft() {
    setWorkspaceStep("draft");
  }

  function openLineItemDialog() {
    setError(null);
    setIsLineItemDialogOpen(true);
  }

  return (
    <main className="load-fade min-h-screen bg-[#edf0eb] text-[#142521]">
      <header className="load-rise border-b border-[#b88746]/35 bg-[#102f2a] text-white shadow-[0_18px_60px_rgb(16_47_42_/_0.18)]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-1 px-5 py-5 lg:px-8">
          <p className="text-xs font-bold uppercase text-[#d7b978]">
            Exclusive Resorts
          </p>
          <h1 className="text-2xl font-semibold text-[#fffaf1] sm:text-3xl">
            Concierge Itinerary Proposal System
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-5 py-6 lg:px-8">
        {(message || error) && (
          <ToastNotice
            error={error}
            message={message}
            proposal={lastProposal}
            onDismiss={() => {
              setMessage(null);
              setError(null);
            }}
          />
        )}

        {reservation ? (
          <section className="app-panel load-rise load-delay-1 overflow-hidden">
            <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className={reservationTextClass}>
                <p className="text-xs font-bold uppercase text-[#54766d]">
                  Reservation context
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-[#123b35]">
                  {reservationContext?.member.name}
                </h2>
              </div>
              {reservations.length > 1 ? (
                <label className="w-full max-w-md text-sm font-semibold text-[#123b35] lg:w-[390px]">
                  <span className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#54766d]">
                    <Users className="h-4 w-4 text-[#b88746]" />
                    Member reservation
                  </span>
                  <span className="relative block">
                    <select
                      value={selectedReservationId}
                      onChange={(event) => selectReservation(Number(event.target.value))}
                      className="h-12 w-full appearance-none rounded-md border border-[#cbbda9] bg-[#fffaf1] pl-4 pr-11 text-sm font-semibold text-[#123b35] shadow-[0_10px_28px_rgb(18_59_53_/_0.07),inset_0_1px_0_rgb(255_255_255_/_0.9)] transition hover:border-[#b88746] focus:border-[#b88746] focus:bg-[#fffdf8] focus:outline-none focus:ring-4 focus:ring-[#b88746]/15"
                    >
                      {reservations.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.member.name} - {item.destination}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d5d22]" />
                  </span>
                </label>
              ) : null}
            </div>
            <div className="grid border-t border-[#d9d0c2] sm:grid-cols-2 xl:grid-cols-4">
              <TripFact
                label="Member"
                value={reservationContext?.member.name ?? ""}
                sub={reservationContext?.member.email}
                contentClassName={reservationTextClass}
              />
              <TripFact
                label="Destination"
                value={reservationContext?.destination ?? ""}
                contentClassName={reservationTextClass}
              />
              <TripFact
                label="Villa"
                value={reservationContext?.villa ?? ""}
                contentClassName={reservationTextClass}
              />
              <TripFact
                label="Dates"
                value={
                  reservationContext
                    ? dateRange(reservationContext.arrivalDate, reservationContext.departureDate)
                    : ""
                }
                contentClassName={reservationTextClass}
              />
            </div>
          </section>
        ) : null}

        <div className="mt-6">
          <div className="min-w-0">
            <section className="workspace-panel app-panel load-rise load-delay-3">
              <div className="border-b border-[#d9d0c2] bg-[#fffdf8] p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase text-[#54766d]">
                      Proposal workspace
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-semibold text-[#123b35]">
                        {workspaceTitle}
                      </h2>
                    </div>
                  </div>
                  <div className="rounded-md border border-[#d9d0c2] bg-[#faf7f0] px-4 py-3 md:text-right">
                    <p className="text-xs font-bold uppercase text-[#6c7068]">
                      Estimated total
                    </p>
                    <p className="mt-1 text-3xl font-semibold text-[#123b35]">
                      {money(total)}
                    </p>
                  </div>
                </div>
                <div className="mt-6">
                  <FlowStrip steps={conciergeFlowSteps} activeId={workspaceStep} />
                </div>
              </div>

              {workspaceStep === "sent" ? (
                <SentConfirmation
                  proposal={lastProposal}
                  onCreateAnother={startAnotherProposal}
                />
              ) : (
                <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="min-w-0 p-6">
                    {workspaceStep === "review" ? (
                      <Field label="Concierge note">
                        <textarea
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          rows={4}
                          className="field-control mt-1 min-h-28 resize-none px-3 py-3"
                        />
                      </Field>
                    ) : null}

                    <div className={workspaceStep === "review" ? "mt-6" : ""}>
                      <ItineraryItems
                        items={items}
                        onAddItem={openLineItemDialog}
                        onRemove={removeItem}
                      />
                    </div>
                  </div>

                  <WorkspaceActions
                    step={workspaceStep}
                    busy={busy}
                    isEditing={editingProposalId !== null}
                    itemCount={items.length}
                    total={total}
                    onBackToDraft={backToDraft}
                    onCancelEdit={() => resetBuilder(reservation)}
                    onSaveChanges={saveDraft}
                    onSaveDraftAndReview={saveDraftAndReview}
                    onSendProposal={sendProposal}
                  />
                </div>
              )}
            </section>

          </div>
        </div>

        <ReservationProposalsSection
          proposals={visibleProposals}
          editingProposalId={editingProposalId}
          busy={busy}
          onLoadDraft={loadDraft}
        />

        <LineItemDialog
          dialogRef={lineItemDialogRef}
          current={current}
          reservation={reservation}
          canAddCurrentItem={canAddCurrentItem}
          onAddItem={addItem}
          onChangeCurrent={setCurrent}
          onClose={() => setIsLineItemDialogOpen(false)}
          onSelectCategory={(category) =>
            setCurrent(newDraftItem(category, reservation))
          }
        />
      </div>
    </main>
  );
}

function LineItemDialog({
  dialogRef,
  current,
  reservation,
  canAddCurrentItem,
  onAddItem,
  onChangeCurrent,
  onClose,
  onSelectCategory,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  current: DraftItem;
  reservation: ReservationContext | null;
  canAddCurrentItem: boolean;
  onAddItem: () => void;
  onChangeCurrent: (item: DraftItem) => void;
  onClose: () => void;
  onSelectCategory: (category: ItineraryCategory) => void;
}) {
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="line-item-dialog-title"
      className="line-item-dialog"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onClose={onClose}
    >
      <section className="max-h-[calc(100dvh-32px)] overflow-y-auto bg-[#fffdf8]">
        <div className="sticky top-0 z-10 border-b border-[#d9d0c2] bg-[#fffdf8] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-[#54766d]">
                Itinerary builder
              </p>
              <h2
                id="line-item-dialog-title"
                className="mt-1 text-xl font-semibold text-[#123b35]"
              >
                Add an experience
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close experience form"
              className="secondary-action inline-flex h-10 w-10 items-center justify-center p-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-5">
          <p className="text-sm font-semibold text-[#123b35]">Category</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {CATEGORIES.map((category) => {
              const Icon = iconMap[category.name];
              return (
                <button
                  key={category.name}
                  type="button"
                  onClick={() => onSelectCategory(category.name)}
                  className={`inline-flex h-11 items-center gap-2 rounded-md border px-3 text-left ${
                    current.category === category.name
                      ? "border-[#b88746] bg-[#fff3df] shadow-sm"
                      : "border-[#d9d0c2] bg-[#fffdf8] hover:border-[#c8bba8] hover:bg-[#f8f2e8]"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-[#b88746]" />
                  <span className="truncate text-sm font-bold text-[#123b35]">
                    {category.name}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 space-y-5 border-t border-[#d9d0c2] pt-5">
            <Field label="Title">
              <input
                value={current.title}
                onChange={(event) =>
                  onChangeCurrent({ ...current, title: event.target.value })
                }
                className="field-control h-12 px-3"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={current.description}
                onChange={(event) =>
                  onChangeCurrent({ ...current, description: event.target.value })
                }
                rows={4}
                className="field-control min-h-24 resize-none px-3 py-3"
              />
            </Field>
            <div className="grid gap-4">
              <TripDateTimePicker
                value={current.scheduledAt}
                reservation={reservation}
                onChange={(scheduledAt) =>
                  onChangeCurrent({ ...current, scheduledAt })
                }
              />
              <Field label="Estimated price">
                <input
                  type="number"
                  min="0"
                  value={current.price}
                  onChange={(event) =>
                    onChangeCurrent({ ...current, price: Number(event.target.value) })
                  }
                  className="field-control h-12 px-3"
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-[#d9d0c2] bg-[#fffdf8] p-5 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onAddItem}
            disabled={!canAddCurrentItem}
            className="primary-action inline-flex min-h-12 w-full items-center justify-center gap-2 text-sm disabled:opacity-50 sm:flex-1"
          >
            <Plus className="h-4 w-4" /> Add experience
          </button>
          <button
            type="button"
            onClick={onClose}
            className="secondary-action inline-flex min-h-12 w-full items-center justify-center gap-2 text-sm sm:flex-1"
          >
            Cancel
          </button>
        </div>
      </section>
    </dialog>
  );
}

function TripDateTimePicker({
  value,
  reservation,
  onChange,
}: {
  value: string;
  reservation: ReservationContext | null;
  onChange: (value: string) => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const selectedDate = scheduledDate(value);
  const selectedTime = scheduledTime(value);
  const tripStart = reservation ? localDateFromIsoDate(reservation.arrivalDate) : null;

  function updateDate(nextDate: Date | undefined) {
    if (!nextDate || !isDateWithinReservation(nextDate, reservation)) return;
    onChange(scheduledAtFor(isoDateFromLocalDate(nextDate), selectedTime));
    setCalendarOpen(false);
  }

  function updateTime(nextTime: string) {
    const datePart =
      (selectedDate ? isoDateFromLocalDate(selectedDate) : null) ??
      reservation?.arrivalDate ??
      isoDateFromLocalDate(new Date());
    onChange(scheduledAtFor(datePart, nextTime));
  }

  return (
    <div className="trip-date-time">
      <p className="text-sm font-semibold text-[#123b35]">Date and time</p>

      <div className="trip-date-time-grid mt-2">
        <div>
          <button
            type="button"
            onClick={() => setCalendarOpen((open) => !open)}
            className="field-control flex h-12 items-center justify-between gap-3 px-3 text-left"
            aria-expanded={calendarOpen}
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-[#b88746]" />
              <span className="truncate">
                {selectedDate ? datePickerFormatter.format(selectedDate) : "Select date"}
              </span>
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-[#8d5d22] transition-transform ${
                calendarOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {calendarOpen ? (
            <div className="mt-2 rounded-md border border-[#d9d0c2] bg-[#fffdf8] p-2 shadow-[0_14px_34px_rgba(20,37,33,0.12)]">
              <ShadcnCalendar
                mode="single"
                selected={selectedDate ?? undefined}
                defaultMonth={selectedDate ?? tripStart ?? undefined}
                onSelect={updateDate}
                disabled={(date) => !isDateWithinReservation(date, reservation)}
                showOutsideDays={false}
                buttonVariant="ghost"
                className="mx-auto bg-[#fffdf8]"
              />
            </div>
          ) : null}
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase text-[#6c7068]">
            Time
          </span>
          <input
            type="time"
            value={selectedTime}
            onChange={(event) => updateTime(event.target.value)}
            className="field-control h-12 px-3"
          />
        </label>
      </div>
    </div>
  );
}

function WorkspaceActions({
  step,
  busy,
  isEditing,
  itemCount,
  total,
  onBackToDraft,
  onCancelEdit,
  onSaveChanges,
  onSaveDraftAndReview,
  onSendProposal,
}: {
  step: ConciergeFlowStepId;
  busy: BusyState;
  isEditing: boolean;
  itemCount: number;
  total: number;
  onBackToDraft: () => void;
  onCancelEdit: () => void;
  onSaveChanges: () => void;
  onSaveDraftAndReview: () => void;
  onSendProposal: () => void;
}) {
  const isBusy = busy !== null;
  const hasItems = itemCount > 0;
  const isDraftStep = step === "draft";

  return (
    <aside className="border-t border-[#d9d0c2] bg-[#faf7f0] p-6 lg:border-l lg:border-t-0">
      <div className="lg:sticky lg:top-6">
        <p className="text-xs font-bold uppercase text-[#54766d]">
          {isDraftStep ? "Draft actions" : "Review actions"}
        </p>

        <div className="mt-4">
          <div className="rounded-md border border-[#d9d0c2] bg-[#fffdf8] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-[#6c7068]">Items</span>
              <span className="font-semibold text-[#123b35]">{itemCount}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#e8ded0] pt-3">
              <span className="text-sm font-semibold text-[#6c7068]">Total</span>
              <span className="text-xl font-semibold text-[#123b35]">
                {money(total)}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {isDraftStep ? (
              <button
                type="button"
                onClick={onSaveDraftAndReview}
                disabled={isBusy || !hasItems}
                className="primary-action inline-flex h-12 w-full items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                {busy === "draft" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {busy === "draft" ? "Saving..." : "Save draft & review"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onBackToDraft}
                  disabled={isBusy}
                  className="secondary-action inline-flex h-12 w-full items-center justify-center gap-2 text-sm disabled:opacity-50"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to draft
                </button>
                <button
                  type="button"
                  onClick={onSaveChanges}
                  disabled={isBusy || !hasItems}
                  className="secondary-action inline-flex h-12 w-full items-center justify-center gap-2 text-sm disabled:opacity-50"
                >
                  {busy === "draft" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {busy === "draft" ? "Saving..." : "Save changes"}
                </button>
                {isEditing ? (
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    disabled={isBusy}
                    className="secondary-action inline-flex h-12 w-full items-center justify-center gap-2 text-sm disabled:opacity-50"
                  >
                    <X className="h-4 w-4" /> Cancel edit
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onSendProposal}
                  disabled={isBusy || !hasItems}
                  className="gold-action inline-flex h-12 w-full items-center justify-center gap-2 text-sm disabled:opacity-50"
                >
                  {busy === "send" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {busy === "send" ? "Sending..." : "Send proposal"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function TripFact({
  label,
  value,
  sub,
  contentClassName = "",
}: {
  label: string;
  value: string;
  sub?: string;
  contentClassName?: string;
}) {
  return (
    <div className="min-w-0 border-b border-[#e8ded0] p-5 xl:border-b-0 xl:border-r xl:last:border-r-0">
      <div className={contentClassName}>
        <p className="text-xs font-bold uppercase text-[#6c7068]">{label}</p>
        <p className="mt-2 break-words text-lg font-semibold text-[#123b35]">{value}</p>
        {sub ? <p className="mt-1 break-words text-sm text-[#6c7068]">{sub}</p> : null}
      </div>
    </div>
  );
}

function ReservationProposalsSection({
  proposals,
  editingProposalId,
  busy,
  onLoadDraft,
}: {
  proposals: ProposalSummary[];
  editingProposalId: number | null;
  busy: "draft" | "send" | null;
  onLoadDraft: (proposalId: number) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<ProposalHistoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const searchedProposals = useMemo(
    () =>
      normalizedSearchQuery
        ? proposals.filter((proposal) =>
            proposalHistorySearchText(proposal).includes(normalizedSearchQuery),
          )
        : proposals,
    [normalizedSearchQuery, proposals],
  );
  const filteredProposals = useMemo(
    () =>
      activeFilter === "all"
        ? searchedProposals
        : searchedProposals.filter((proposal) => proposal.status === activeFilter),
    [activeFilter, searchedProposals],
  );
  const filterCounts = useMemo(
    () => {
      const counts: Record<ProposalHistoryFilter, number> = {
        all: searchedProposals.length,
        draft: 0,
        sent: 0,
        approved: 0,
        paid: 0,
      };

      searchedProposals.forEach((proposal) => {
        counts[proposal.status] += 1;
      });

      return counts;
    },
    [searchedProposals],
  );
  const activeFilterLabel =
    proposalHistoryFilters
      .find((filter) => filter.id === activeFilter)
      ?.label.toLowerCase() ?? "selected";
  const filteredProposalNoun =
    activeFilter === "all" ? "proposals" : `${activeFilterLabel} proposals`;
  const shownProposalLabel = `${filteredProposals.length} of ${proposals.length} ${
    proposals.length === 1 ? "proposal" : "proposals"
  }`;

  return (
    <section className="app-panel load-rise load-delay-2 mt-6 overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#54766d]">
            Reservation proposals
          </p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-[#123b35]">
            <MailCheck className="h-5 w-5 text-[#b88746]" />
            Proposal history
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#6c7068]">
            Drafts and sent proposals for this reservation stay close to the workspace.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[#6c7068]">
            {shownProposalLabel}
          </span>
        </div>
      </div>

      <div className="border-t border-[#d9d0c2] p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr] lg:items-center">
          <label className="relative block">
            <span className="sr-only">Search proposal history</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c7068]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search villa, destination, dates..."
              className="field-control h-11 pl-10 pr-3"
            />
          </label>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {proposalHistoryFilters.map((filter) => {
              const isActive = activeFilter === filter.id;

              return (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveFilter(filter.id)}
                  className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-bold transition ${
                    isActive
                      ? "border-[#123b35] bg-[#123b35] text-white"
                      : "border-[#d9d0c2] bg-[#fffdf8] text-[#123b35] hover:border-[#b88746] hover:bg-[#fff8ec]"
                  }`}
                >
                  {filter.label}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      isActive ? "bg-white/15 text-white" : "bg-[#faf7f0] text-[#6c7068]"
                    }`}
                  >
                    {filterCounts[filter.id]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {filteredProposals.length === 0 ? (
            <p className="rounded-md border border-[#d9d0c2] bg-[#faf7f0] p-5 text-sm leading-6 text-[#6c7068] lg:col-span-2 xl:col-span-3">
              {proposals.length === 0
                ? "Proposals for this reservation will appear here."
                : normalizedSearchQuery
                  ? `No ${filteredProposalNoun} match "${searchQuery.trim()}".`
                  : `No ${filteredProposalNoun} for this reservation yet.`}
            </p>
          ) : (
            filteredProposals.map((proposal) => (
              <article
                key={proposal.id}
                className={`flex min-h-full flex-col rounded-md border p-4 ${
                  editingProposalId === proposal.id
                    ? "border-[#b88746] bg-[#fff3df]"
                    : "border-[#d9d0c2] bg-[#faf7f0]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase text-[#54766d]">
                      Proposal #{proposal.id}
                    </p>
                    <h3 className="mt-1 break-words text-lg font-semibold text-[#123b35]">
                      {proposal.memberName}
                    </h3>
                    <p className="mt-1 break-all text-sm text-[#6c7068]">
                      {proposal.memberEmail}
                    </p>
                  </div>
                  <Status status={proposal.status} />
                </div>

                <div className="mt-4 space-y-3 rounded-md border border-[#e1d7ca] bg-[#fffdf8] p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#b88746]" />
                    <div className="min-w-0">
                      <p className="font-semibold text-[#123b35]">{proposal.villa}</p>
                      <p className="mt-0.5 break-words text-[#6c7068]">
                        {proposal.destination}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#b88746]" />
                    <div>
                      <p className="font-semibold text-[#123b35]">
                        {dateRange(proposal.arrivalDate, proposal.departureDate)}
                      </p>
                      <p className="mt-0.5 text-[#6c7068]">Reservation stay</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs font-bold uppercase text-[#6c7068]">Items</p>
                    <p className="mt-1 font-semibold text-[#123b35]">
                      {proposal.itemCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-[#6c7068]">Total</p>
                    <p className="mt-1 font-semibold text-[#123b35]">
                      {money(proposal.total)}
                    </p>
                  </div>
                </div>

                <div className="mt-auto flex flex-wrap gap-3 border-t border-[#e1d7ca] pt-4">
                  {proposal.status === "draft" ? (
                    <button
                      type="button"
                      onClick={() => onLoadDraft(proposal.id)}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b35] disabled:opacity-50"
                    >
                      <Edit3 className="h-4 w-4" /> Edit draft
                    </button>
                  ) : null}
                  <Link
                    href={`/proposal/${proposal.id}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[#123b35]"
                  >
                    Member view <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[#123b35]">{label}</span>
      {children}
    </label>
  );
}

function ItineraryItems({
  items,
  onAddItem,
  onRemove,
}: {
  items: DraftItem[];
  onAddItem?: () => void;
  onRemove?: (localId: string) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9d0c2] pb-3">
        <h3 className="text-lg font-semibold text-[#123b35]">
          Itinerary experiences
        </h3>
        <span className="rounded-md bg-[#faf7f0] px-3 py-1 text-xs font-bold uppercase text-[#6c7068]">
          {items.length} {items.length === 1 ? "experience" : "experiences"}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <article
            key={item.localId}
            className="rounded-md border border-[#d9d0c2] bg-[#fffdf8] p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-[#54766d]">
                  {item.category}
                </p>
                <h3 className="mt-2 break-words text-base font-semibold text-[#123b35]">
                  {item.title}
                </h3>
              </div>
              {onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(item.localId)}
                  aria-label={`Remove ${item.title}`}
                  className="secondary-action shrink-0 p-2 text-[#6c7068]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <p className="mt-3 break-words text-sm leading-6 text-[#6c7068]">
              {item.description}
            </p>
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-[#123b35]">
              <CalendarDays className="mr-2 inline h-4 w-4" />
              {dateTime(item.scheduledAt)} · {money(item.price)}
            </p>
          </article>
        ))}

        {onAddItem ? (
          <button
            type="button"
            onClick={onAddItem}
            className="group flex min-h-24 w-full items-center justify-center rounded-md border border-[#d9d0c2] bg-[#fffdf8] p-6 text-center shadow-[0_10px_26px_rgba(18,59,53,0.04)] transition hover:-translate-y-0.5 hover:border-[#b88746] hover:bg-[#fff8ec] hover:shadow-[0_14px_30px_rgba(18,59,53,0.08)]"
          >
            <span className="inline-flex items-center gap-3 text-sm font-bold text-[#123b35]">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#123b35] text-white transition group-hover:bg-[#0a2d28]">
                <Plus className="h-4 w-4" />
              </span>
              Add experience
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SentConfirmation({
  proposal,
  onCreateAnother,
}: {
  proposal: ProposalDetail | null;
  onCreateAnother: () => void;
}) {
  if (!proposal) {
    return (
      <div className="p-8">
        <p className="rounded-md border border-[#d9d0c2] bg-[#faf7f0] p-6 text-sm text-[#6c7068]">
          The proposal was sent. Start another proposal when you are ready.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <section className="confirm-in rounded-md border border-[#b9d2c1] bg-[#edf7ef] p-4 shadow-sm sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_270px] lg:items-start">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#d8eadf] text-[#2f7253] sm:h-12 sm:w-12">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-[#54766d]">
                Proposal sent
              </p>
              <h2 className="mt-2 text-xl font-semibold leading-tight text-[#123b35] sm:text-2xl">
                Proposal #{proposal.id} is now with {proposal.member.name}.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6c7068]">
                The member can review the itinerary, approve it, and lock in the stay from
                the member view.
              </p>
            </div>
          </div>
          <div className="w-full rounded-md border border-[#b9d2c1] bg-[#fffdf8] p-4 lg:text-right">
            <div className="grid gap-4 sm:grid-cols-2 lg:block">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-[#6c7068]">Sent to</p>
                <p className="mt-1 break-all text-sm font-semibold leading-5 text-[#123b35]">
                  {proposal.member.email}
                </p>
              </div>
              <div className="border-t border-[#e1d7ca] pt-4 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 lg:mt-4 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-4">
                <p className="text-xs font-bold uppercase text-[#6c7068]">Total</p>
                <p className="mt-1 text-2xl font-semibold text-[#123b35]">
                  {money(proposal.total)}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3 border-t border-[#b9d2c1] pt-5 sm:flex-row">
          <Link
            href={proposalHref(proposal)}
            className="primary-action inline-flex h-12 w-full items-center justify-center gap-2 px-4 text-sm sm:w-auto"
          >
            Open member view <ExternalLink className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={onCreateAnother}
            className="secondary-action inline-flex h-12 w-full items-center justify-center gap-2 px-4 text-sm sm:w-auto"
          >
            <Plus className="h-4 w-4" /> Create another proposal
          </button>
        </div>
      </section>
    </div>
  );
}

function ToastNotice({
  error,
  message,
  proposal,
  onDismiss,
}: {
  error: string | null;
  message: string | null;
  proposal: ProposalDetail | null;
  onDismiss: () => void;
}) {
  const isError = Boolean(error);

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-50 flex justify-end sm:top-5">
      <div
        role={isError ? "alert" : "status"}
        aria-live={isError ? "assertive" : "polite"}
        className={`toast-in pointer-events-auto w-full max-w-md rounded-md border bg-[#fffdf8] p-4 text-sm shadow-2xl ${
          isError ? "border-red-200 text-red-800" : "border-[#b9d2c1] text-[#123b35]"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 rounded-md p-1.5 ${
              isError ? "bg-red-50 text-red-700" : "bg-[#edf7ef] text-[#2f7253]"
            }`}
          >
            {isError ? <X className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words font-semibold">{error ?? message}</p>
            {!isError && proposal && proposal.status !== "draft" ? (
              <Link
                href={proposalHref(proposal)}
                className="mt-2 inline-flex items-center gap-2 font-semibold text-[#b88746]"
              >
                Open member view <ExternalLink className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="secondary-action -mr-1 -mt-1 shrink-0 p-1.5 text-[#6c7068]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Status({ status }: { status: ProposalStatus }) {
  return <ProposalStatusBadge status={status} />;
}
