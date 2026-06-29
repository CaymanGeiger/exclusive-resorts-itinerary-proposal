"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { date, dateRange, dateTime, groupByDay, money, time } from "@/lib/format";
import type { ProposalDetail, ProposalStatus } from "@/lib/types";

const statusClass: Record<ProposalStatus, string> = {
  draft: "border-stone-300 bg-stone-100 text-stone-700",
  sent: "border-sky-200 bg-sky-50 text-sky-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  paid: "border-amber-200 bg-amber-50 text-amber-800",
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
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

  useEffect(() => {
    if (initialProposal) return;
    let active = true;

    async function loadProposal() {
      setLoading(true);
      setError(null);
      try {
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

  async function updateStatus(status: ProposalStatus) {
    if (!proposal) return;
    const previous = proposal;
    const optimisticProposal: ProposalDetail = { ...proposal, status };
    setBusy(status);
    setError(null);
    setLastAction(null);
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
      setError(caught instanceof Error ? caught.message : "Unable to update proposal.");
    } finally {
      setBusy(null);
    }
  }

  if (!proposal) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7f2] px-5">
        <section className="max-w-md border border-[#dfe5dd] bg-white p-8 text-center">
          <h1 className="text-2xl font-semibold text-[#17344a]">
            {loading ? "Loading proposal" : "Proposal unavailable"}
          </h1>
          <p className="mt-3 text-sm text-[#69746e]">
            {loading
              ? "Preparing your itinerary view."
              : error ?? "This proposal could not be found."}
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#17344a] px-4 text-sm font-semibold text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
        </section>
      </main>
    );
  }

  const canApprove = proposal.status === "sent";
  const canPay = proposal.status === "approved";

  return (
    <main className="min-h-screen bg-[#f5f7f2] text-[#17211c]">
      <section className="relative min-h-[520px] bg-[#17344a] text-white">
        <div className="absolute inset-0 bg-[url('/punta-mita-coast.png')] bg-cover bg-center opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 to-black/25" />
        <div className="relative mx-auto flex min-h-[520px] max-w-7xl flex-col px-5 py-6 lg:px-8">
          <nav className="flex items-center justify-between">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium">
              <ArrowLeft className="h-4 w-4" /> Concierge
            </Link>
            <Status status={proposal.status} />
          </nav>
          <div className="mt-auto max-w-3xl pb-8">
            <p className="text-sm font-semibold uppercase text-[#d8c083]">
              Exclusive Resorts Proposal
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-6xl">
              {proposal.reservation.villa} itinerary for {proposal.member.name}
            </h1>
            <p className="mt-5 text-lg text-white/85">
              {proposal.reservation.destination} ·{" "}
              {dateRange(proposal.reservation.arrivalDate, proposal.reservation.departureDate)}
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        {error ? (
          <div className="mb-6 border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {proposal.status === "approved" && lastAction === "approved" ? (
          <section className="confirm-in mb-8 border border-emerald-200 bg-emerald-50 p-6">
            <div className="flex items-start gap-4">
              <div className="rounded-md bg-emerald-100 p-3 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-[#17344a]">
                  Proposal approved.
                </h2>
                <p className="mt-2 text-sm text-[#69746e]">
                  The concierge team can see the approval. Complete the simulated payment
                  step to lock in the itinerary.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {proposal.status === "paid" ? (
          <section className="confirm-in mb-8 border border-amber-200 bg-[#fffaf0] p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <div className="rounded-md bg-amber-100 p-3 text-amber-700">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-[#17344a]">
                    Your itinerary is locked in.
                  </h2>
                  <p className="mt-2 text-sm text-[#69746e]">
                    The concierge team has the approved proposal and simulated payment
                    confirmation on file.
                  </p>
                </div>
              </div>
              <p className="text-3xl font-semibold text-[#17344a]">
                {money(proposal.total)}
              </p>
            </div>
          </section>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <section className="space-y-6">
            <div className="border border-[#dfe5dd] bg-white p-6">
              <p className="text-sm font-semibold uppercase text-[#6f8a74]">
                Curated itinerary
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-[#17344a]">
                A week shaped around ease, privacy, and the coast
              </h2>
              {proposal.note ? (
                <p className="mt-5 max-w-3xl border-l-4 border-[#b38a41] pl-4 leading-8 text-[#69746e]">
                  {proposal.note}
                </p>
              ) : null}
            </div>

            {grouped.map(({ day, items }) => (
              <section key={day} className="border border-[#dfe5dd] bg-white">
                <div className="border-b border-[#dfe5dd] bg-[#fbfcf9] p-5">
                  <p className="font-medium text-[#69746e]">{date(day)}</p>
                </div>
                <div className="divide-y divide-[#dfe5dd]">
                  {items.map((item) => (
                    <article key={item.id} className="grid gap-4 p-5 md:grid-cols-[110px_1fr_auto]">
                      <p className="flex items-center gap-2 text-sm font-semibold text-[#6f8a74]">
                        <Clock className="h-4 w-4" /> {time(item.scheduledAt)}
                      </p>
                      <div>
                        <p className="text-xs font-semibold uppercase text-[#69746e]">
                          {item.category}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-[#17344a]">
                          {item.title}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-[#69746e]">
                          {item.description}
                        </p>
                        <p className="mt-3 text-xs text-[#69746e]">
                          {dateTime(item.scheduledAt)}
                        </p>
                      </div>
                      <p className="text-lg font-semibold text-[#17344a]">
                        {money(item.price)}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </section>

          <aside className="space-y-5">
            <section className="border border-[#dfe5dd] bg-white p-5">
              <h2 className="text-xl font-semibold text-[#17344a]">Review and lock in</h2>
              <p className="mt-2 text-sm leading-6 text-[#69746e]">
                {proposal.status === "draft"
                  ? "This proposal is still being prepared by the concierge team."
                  : "Approve first, then complete the simulated payment step."}
              </p>
              <div className="mt-5 grid gap-3">
                <button
                  type="button"
                  onClick={() => updateStatus("approved")}
                  disabled={!canApprove || busy !== null}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#17344a] text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === "approved" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {proposal.status === "approved" || proposal.status === "paid"
                    ? busy === "approved"
                      ? "Approving..."
                      : "Approved"
                    : proposal.status === "draft"
                      ? "Awaiting send"
                      : "Approve proposal"}
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus("paid")}
                  disabled={!canPay || busy !== null}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#b38a41] text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === "paid" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  {proposal.status === "paid"
                    ? busy === "paid"
                      ? "Locking..."
                      : "Paid and locked"
                    : "Pay & Lock In"}
                </button>
              </div>
            </section>

            <section className="border border-[#dfe5dd] bg-white p-5">
              <h2 className="text-xl font-semibold text-[#17344a]">Stay details</h2>
              <div className="mt-5 space-y-4 text-sm text-[#69746e]">
                <p>
                  <Sparkles className="mr-2 inline h-4 w-4 text-[#b38a41]" />
                  {proposal.reservation.destination}
                </p>
                <p>
                  <CalendarDays className="mr-2 inline h-4 w-4 text-[#b38a41]" />
                  {dateRange(proposal.reservation.arrivalDate, proposal.reservation.departureDate)}
                </p>
                <p className="font-semibold text-[#17344a]">Total: {money(proposal.total)}</p>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Status({ status }: { status: ProposalStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-semibold uppercase ${statusClass[status]}`}
    >
      {status}
    </span>
  );
}
