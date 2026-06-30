"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  ReceiptText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { FlowStrip, type FlowStep } from "@/components/FlowStrip";
import { ProposalStatusBadge } from "@/components/ProposalStatusBadge";
import { readJson } from "@/lib/api";
import { date, dateRange, dateTime, groupByDay, money, time } from "@/lib/format";
import { decodeProposalSnapshot, proposalSnapshotParam } from "@/lib/proposal-link";
import type { ProposalDetail, ProposalStatus } from "@/lib/types";

type MemberFlowStepId = "review" | "approve" | "pay";

const memberFlowSteps: readonly FlowStep<MemberFlowStepId>[] = [
  { id: "review", label: "Review" },
  { id: "approve", label: "Approve" },
  { id: "pay", label: "Pay" },
];

function memberFlowStep(status: ProposalStatus): MemberFlowStepId {
  if (status === "paid") return "pay";
  if (status === "approved") return "approve";
  return "review";
}

function memberHeroCopy(proposal: ProposalDetail) {
  if (proposal.status === "paid") {
    return {
      eyebrow: "Confirmed Exclusive Resorts itinerary",
      title: "Your itinerary is locked in.",
    };
  }

  return {
    eyebrow: "Exclusive Resorts private proposal",
    title: `${proposal.reservation.villa} itinerary for ${proposal.member.name}`,
  };
}

function approvalCopyFor(status: ProposalStatus) {
  if (status === "draft") {
    return "This proposal is still being prepared by the concierge team.";
  }
  if (status === "paid") {
    return "Your itinerary is approved, paid, and locked in with the concierge team.";
  }
  if (status === "approved") {
    return "Your itinerary is approved. Complete the payment step to lock it in.";
  }
  return "Review the itinerary, approve it, then lock in your stay.";
}

function confirmationMotionClass(lastAction: ProposalStatus | null, inView: boolean) {
  if (lastAction !== "approved" && lastAction !== "paid") return "";
  return inView ? "confirm-in" : "confirm-prep";
}

function isConfirmationAlreadyVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const visibleTop = Math.max(rect.top, 0);
  const visibleBottom = Math.min(rect.bottom, viewportHeight);
  const visibleHeight = Math.max(visibleBottom - visibleTop, 0);
  const minimumVisibleHeight = Math.min(rect.height * 0.45, 180);

  return (
    rect.top < viewportHeight * 0.72 &&
    rect.bottom > 72 &&
    visibleHeight >= minimumVisibleHeight
  );
}

export function MemberProposal({
  proposalId,
  initialProposal,
}: {
  proposalId: string;
  initialProposal: ProposalDetail | null;
}) {
  const [proposal, setProposal] = useState(initialProposal);
  const [loading, setLoading] = useState(!initialProposal);
  const [busy, setBusy] = useState<ProposalStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<ProposalStatus | null>(null);
  const [confirmationInView, setConfirmationInView] = useState(false);
  const [itineraryPromptVisible, setItineraryPromptVisible] = useState(false);
  const confirmationRef = useRef<HTMLElement | null>(null);
  const itineraryPromptDismissedRef = useRef(false);
  const itineraryStartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialProposal) return;
    let active = true;

    async function loadProposal() {
      setLoading(true);
      setError(null);
      try {
        const snapshot = decodeProposalSnapshot(
          new URLSearchParams(window.location.search).get(proposalSnapshotParam()),
        );
        if (snapshot) {
          if (active) setProposal(snapshot);
          return;
        }

        const data = await readJson<{ proposal: ProposalDetail }>(
          await fetch(`/api/proposals/${proposalId}`),
        );
        if (active) setProposal(data.proposal);
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Unable to load proposal.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProposal();
    return () => {
      active = false;
    };
  }, [initialProposal, proposalId]);

  const grouped = useMemo(() => {
    if (!proposal) return [];
    const groups = groupByDay(proposal.items);
    return Object.keys(groups)
      .sort()
      .map((day) => ({ day, items: groups[day] ?? [] }));
  }, [proposal]);

  useLayoutEffect(() => {
    if (lastAction !== "approved" && lastAction !== "paid") {
      setConfirmationInView(false);
      return;
    }

    const element = confirmationRef.current;
    if (!element) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (isConfirmationAlreadyVisible(element)) {
      setConfirmationInView(true);
      element.focus({ preventScroll: true });
      return;
    }

    setConfirmationInView(reducedMotion);
    let observer: IntersectionObserver | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const frame = window.requestAnimationFrame(() => {
      if (reducedMotion) {
        setConfirmationInView(true);
      } else if ("IntersectionObserver" in window) {
        observer = new IntersectionObserver(
          ([entry]) => {
            if (!entry?.isIntersecting) return;
            setConfirmationInView(true);
            observer?.disconnect();
          },
          { threshold: 0.35 },
        );
        observer.observe(element);
      } else {
        fallbackTimer = setTimeout(() => setConfirmationInView(true), 220);
      }

      element.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
      element.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [lastAction]);

  useEffect(() => {
    let frame: number | null = null;

    function updatePromptVisibility() {
      frame = null;
      const isAtTop = window.scrollY < 120;

      if (!isAtTop) itineraryPromptDismissedRef.current = false;
      setItineraryPromptVisible(isAtTop && !itineraryPromptDismissedRef.current);
    }

    function scheduleVisibilityUpdate() {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updatePromptVisibility);
    }

    updatePromptVisibility();
    window.addEventListener("scroll", scheduleVisibilityUpdate, { passive: true });
    window.addEventListener("resize", scheduleVisibilityUpdate);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleVisibilityUpdate);
      window.removeEventListener("resize", scheduleVisibilityUpdate);
    };
  }, []);

  function scrollToItinerary() {
    const element = itineraryStartRef.current;
    if (!element) return;

    itineraryPromptDismissedRef.current = true;
    setItineraryPromptVisible(false);

    window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      element.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
      element.focus({ preventScroll: true });
    });
  }

  async function updateStatus(status: ProposalStatus) {
    if (!proposal) return;
    const previous = proposal;
    const optimisticProposal: ProposalDetail = { ...proposal, status };
    setBusy(status);
    setError(null);
    setLastAction(null);
    setConfirmationInView(false);
    setProposal(optimisticProposal);
    try {
      const data = await readJson<{ proposal: ProposalDetail }>(
        await fetch(`/api/proposals/${proposalId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }),
      );
      setProposal(data.proposal);
      setLastAction(status);
    } catch (caught) {
      setProposal(previous);
      setLastAction(null);
      setConfirmationInView(false);
      setError(caught instanceof Error ? caught.message : "Unable to update proposal.");
    } finally {
      setBusy(null);
    }
  }

  if (!proposal) {
    return (
      <main className="load-fade flex min-h-screen items-center justify-center bg-[#f6efe2] px-5">
        <section className="app-panel load-rise max-w-md p-8 text-center">
          <h1 className="text-2xl font-semibold text-[#123b35]">
            {loading ? "Loading proposal" : "Proposal unavailable"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#706f66]">
            {loading
              ? "Preparing your itinerary view."
              : error ?? "This proposal could not be found."}
          </p>
          <Link
            href="/"
            className="primary-action mt-6 inline-flex h-11 items-center justify-center gap-2 px-4 text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
        </section>
      </main>
    );
  }

  const canApprove = proposal.status === "sent";
  const canPay = proposal.status === "approved";
  const activeFlowStep = memberFlowStep(proposal.status);
  const isPaid = proposal.status === "paid";
  const heroCopy = memberHeroCopy(proposal);
  const approvalCopy = approvalCopyFor(proposal.status);
  const confirmationClass = confirmationMotionClass(lastAction, confirmationInView);

  return (
    <main className="load-fade min-h-screen bg-[#f4ecdf] text-[#172722]">
      <section className="relative overflow-hidden bg-[#09231f] text-white">
        <div className="load-hero-image absolute inset-0 bg-[url('/punta-mita-coast.png')] bg-cover bg-center opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#031613]/95 via-[#123b32]/70 to-[#9a6a2d]/20" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#f4ecdf]/70 via-[#f4ecdf]/22 to-transparent" />
        <div className="hero-birds" aria-hidden="true">
          <span className="hero-bird" />
          <span className="hero-bird" />
          <span className="hero-bird" />
        </div>
        <div className="relative mx-auto flex min-h-[620px] max-w-[1320px] flex-col px-5 py-7 lg:px-8">
          <nav className="load-rise load-delay-1 flex items-center justify-start">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white/90 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" /> Concierge
            </Link>
          </nav>

          <div className="load-rise load-delay-2 mt-auto grid gap-8 pb-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
            <div className="max-w-4xl">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#f3d38b]">
                {heroCopy.eyebrow}
              </p>
              <h1 className="mt-5 text-4xl font-semibold leading-tight text-[#fffaf1] sm:text-5xl lg:text-6xl">
                {heroCopy.title}
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/85">
                Prepared for {proposal.member.name} at {proposal.reservation.villa}.
              </p>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-base text-white/80">
                <span className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[#f3d38b]" />
                  {proposal.reservation.destination}
                </span>
                <span className="hidden h-1 w-1 rounded-full bg-white/45 sm:block" />
                <span>{dateRange(proposal.reservation.arrivalDate, proposal.reservation.departureDate)}</span>
              </p>
            </div>

            <aside className="rounded-md border border-white/20 bg-white/14 p-5 shadow-[0_16px_42px_rgb(0_0_0_/_0.18)]">
              <div className="flex items-start justify-between gap-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#f3d38b]">
                  Total cost
                </p>
                <Status status={proposal.status} />
              </div>
              <p className="mt-3 text-4xl font-semibold text-[#fffaf1]">
                {money(proposal.total)}
              </p>
              <div className="mt-5 space-y-3 border-t border-white/20 pt-4 text-sm text-white/82">
                <p className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#f3d38b]" />
                  {proposal.items.length} curated {proposal.items.length === 1 ? "experience" : "experiences"}
                </p>
                <p className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#f3d38b]" />
                  {dateRange(proposal.reservation.arrivalDate, proposal.reservation.departureDate)}
                </p>
              </div>
            </aside>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-14 left-[50vw] z-10 flex w-screen -translate-x-1/2 justify-center px-5">
          <button
            type="button"
            onClick={scrollToItinerary}
            tabIndex={itineraryPromptVisible ? 0 : -1}
            aria-hidden={!itineraryPromptVisible}
            className={`hero-scroll-prompt pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/22 bg-white/16 px-4 py-2 text-sm font-semibold text-white/88 shadow-[0_10px_24px_rgb(0_0_0_/_0.16)] hover:border-white/34 hover:bg-white/20 hover:text-white ${
              itineraryPromptVisible ? "hero-scroll-prompt-visible" : "hero-scroll-prompt-hidden"
            }`}
          >
            View itinerary
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </section>

      <div
        ref={itineraryStartRef}
        tabIndex={-1}
        className="relative mx-auto -mt-10 max-w-[1320px] scroll-mt-6 px-5 pb-12 focus:outline-none lg:px-8"
      >
        {error ? (
          <div className="load-rise mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {proposal.status === "approved" && lastAction === "approved" ? (
          <section
            ref={confirmationRef}
            tabIndex={-1}
            aria-live="polite"
            aria-atomic="true"
            className={`${confirmationClass} mb-8 scroll-mt-6 rounded-md border border-[#b9d2c1] bg-[#edf7ef] p-6 shadow-[0_18px_50px_rgb(18_59_53_/_0.08)] focus:outline-none`}
          >
            <div className="flex items-start gap-4">
              <div className="rounded-md bg-[#d8eadf] p-3 text-[#2f7253]">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="break-words text-2xl font-semibold text-[#123b35]">
                  Itinerary approved.
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#706f66]">
                  Your concierge can see the approval. Complete the payment step to lock
                  in the itinerary.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {isPaid ? (
          <section
            ref={confirmationRef}
            tabIndex={-1}
            aria-live="polite"
            aria-atomic="true"
            className={`${confirmationClass} mb-8 scroll-mt-6 overflow-hidden rounded-md border border-[#e6c98f] bg-[#fff8e8] shadow-[0_24px_70px_rgb(18_59_53_/_0.1)] focus:outline-none`}
          >
            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex items-start gap-4">
                <div className="ml-6 mt-6 rounded-md bg-[#f4e4bd] p-3 text-[#8d5d22]">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div className="min-w-0 px-6 py-6 pl-0">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#8d5d22]">
                    Confirmation
                  </p>
                  <h2 className="mt-2 break-words text-2xl font-semibold text-[#123b35] sm:text-3xl">
                    Your stay is confirmed.
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#706f66]">
                    Your itinerary is approved, paid, and locked in with the concierge
                    team.
                  </p>
                </div>
              </div>
              <div className="border-t border-[#e6c98f] bg-[#f4e4bd] p-6 text-[#123b35] lg:border-l lg:border-t-0">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#8d5d22]">
                  Paid total
                </p>
                <p className="mt-3 text-4xl font-semibold">{money(proposal.total)}</p>
                <p className="mt-4 text-sm leading-6 text-[#6f634f]">
                  {proposal.reservation.villa} · {proposal.reservation.destination}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_390px]">
          <section className="space-y-6">
            <section className="app-panel load-rise load-delay-3 p-7">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6b7b54]">
                Curated itinerary
              </p>
              <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-[#123b35]">
                A week shaped around ease, privacy, and the coast
              </h2>
              {proposal.note ? (
                <p className="mt-6 max-w-3xl border-l-4 border-[#b88746] pl-5 text-base leading-8 text-[#706f66]">
                  {proposal.note}
                </p>
              ) : null}
            </section>

            <section className="app-panel load-rise load-delay-4 overflow-hidden">
              <div className="border-b border-[#e2d6c7] bg-[#fffdf8] px-6 py-5">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6b7b54]">
                  Itinerary folio
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-[#123b35]">
                  Selected experiences
                </h2>
              </div>

              <div className="divide-y divide-[#e2d6c7]">
                {grouped.map(({ day, items }) => (
                  <section
                    key={day}
                    className="grid gap-6 px-6 py-7 md:grid-cols-[160px_minmax(0,1fr)]"
                  >
                    <div>
                      <p className="text-lg font-semibold text-[#123b35]">{date(day)}</p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.08em] text-[#706f66]">
                        {items.length} {items.length === 1 ? "item" : "items"}
                      </p>
                    </div>

                    <div className="relative space-y-8 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-[#d8c9b8]">
                      {items.map((item) => (
                        <article
                          key={item.id}
                          className="relative grid gap-4 pl-9 md:grid-cols-[minmax(0,1fr)_120px]"
                        >
                          <span className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 border-[#b88746] bg-[#fffdf8] shadow-[0_0_0_4px_#f4ecdf]" />
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold uppercase tracking-[0.08em] text-[#6b7b54]">
                              <span className="inline-flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" />
                                {time(item.scheduledAt)}
                              </span>
                              <span>{item.category}</span>
                            </p>
                            <h3 className="mt-2 break-words text-xl font-semibold text-[#123b35]">
                              {item.title}
                            </h3>
                            <p className="mt-3 break-words text-sm leading-6 text-[#706f66]">
                              {item.description}
                            </p>
                            <p className="mt-4 text-sm font-semibold text-[#315f56]">
                              {dateTime(item.scheduledAt)}
                            </p>
                          </div>
                          <p className="text-left text-lg font-semibold text-[#123b35] md:text-right">
                            {money(item.price)}
                          </p>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
                <div className="flex flex-col gap-2 bg-[#fbf6ec] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-[#706f66]">Total itinerary cost</p>
                  <p className="text-3xl font-semibold text-[#123b35]">{money(proposal.total)}</p>
                </div>
              </div>
            </section>
          </section>

          <aside className="space-y-5 lg:sticky lg:top-6 lg:h-fit">
            <section className="app-panel load-rise load-delay-5 overflow-hidden">
              <div className="border-b border-[#2e5b51] bg-[#123b35] p-6 text-[#fffaf1]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#f3d38b]">
                      Approval folio
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold">Review and lock in</h2>
                  </div>
                  <Status status={proposal.status} />
                </div>
                <p className="mt-6 text-xs font-bold uppercase tracking-[0.12em] text-white/62">
                  Total cost
                </p>
                <p className="mt-2 text-4xl font-semibold">{money(proposal.total)}</p>
              </div>

              <div className="p-6">
                <FlowStrip
                  steps={memberFlowSteps}
                  activeId={activeFlowStep}
                  tone="member"
                />
                <p className="mt-5 text-sm leading-6 text-[#706f66]">{approvalCopy}</p>
                <div className="mt-6 grid gap-3">
                  <button
                    type="button"
                    onClick={() => updateStatus("approved")}
                    disabled={!canApprove || busy !== null}
                    className="primary-action inline-flex h-12 items-center justify-center gap-2 text-sm disabled:opacity-50"
                  >
                    {busy === "approved" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {proposal.status === "approved" || proposal.status === "paid"
                      ? busy === "approved"
                        ? "Approving..."
                        : "Approved"
                      : proposal.status === "draft"
                        ? "Awaiting send"
                        : "Approve itinerary"}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateStatus("paid")}
                    disabled={!canPay || busy !== null}
                    className={`gold-action member-pay-action inline-flex h-12 items-center justify-center gap-2 text-sm disabled:cursor-not-allowed ${
                      proposal.status === "paid" ? "member-pay-action-complete" : ""
                    }`}
                  >
                    {busy === "paid" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4" />
                    )}
                    {proposal.status === "paid"
                      ? busy === "paid"
                        ? "Locking..."
                        : "Paid and locked"
                      : "Pay & Lock In"}
                  </button>
                </div>
              </div>
            </section>

            <section className="app-panel load-rise load-delay-5 p-6">
              <h2 className="text-xl font-semibold text-[#123b35]">Reservation summary</h2>
              <div className="mt-5 space-y-4 text-sm leading-6 text-[#706f66]">
                <p className="flex gap-2">
                  <ReceiptText className="mt-1 h-4 w-4 shrink-0 text-[#b88746]" />
                  Prepared for {proposal.member.name}
                </p>
                <p className="flex gap-2">
                  <Sparkles className="mt-1 h-4 w-4 shrink-0 text-[#b88746]" />
                  {proposal.reservation.villa}
                </p>
                <p className="flex gap-2">
                  <MapPin className="mt-1 h-4 w-4 shrink-0 text-[#b88746]" />
                  {proposal.reservation.destination}
                </p>
                <p className="flex gap-2">
                  <CalendarDays className="mt-1 h-4 w-4 shrink-0 text-[#b88746]" />
                  {dateRange(proposal.reservation.arrivalDate, proposal.reservation.departureDate)}
                </p>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Status({ status }: { status: ProposalStatus }) {
  return <ProposalStatusBadge status={status} className="px-3" />;
}
