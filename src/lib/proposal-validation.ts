import { isObject } from "@/lib/api";
import { isCategory } from "@/lib/categories";
import { getReservation } from "@/lib/db";
import type { ProposalDraftInput, ProposalItemInput } from "@/lib/types";

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string; status?: number };

const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export function parseProposalDraftInput(
  body: Record<string, unknown>,
): ValidationResult<ProposalDraftInput> {
  const reservationId = Number(body.reservationId);
  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    return { ok: false, message: "reservationId must be a positive integer." };
  }

  const reservation = getReservation(reservationId);
  if (!reservation) {
    return { ok: false, message: "Reservation not found.", status: 404 };
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { ok: false, message: "At least one proposal item is required." };
  }

  const items: ProposalItemInput[] = [];
  for (const item of body.items) {
    if (!isObject(item) || !isCategory(item.category)) {
      return { ok: false, message: "Every item needs a valid category." };
    }

    const title = typeof item.title === "string" ? item.title.trim() : "";
    const description =
      typeof item.description === "string" ? item.description.trim() : "";
    const scheduledAt =
      typeof item.scheduledAt === "string" ? item.scheduledAt.trim() : "";
    const price = Number(item.price);

    if (!title || !description || !scheduledAt || !Number.isFinite(price) || price < 0) {
      return {
        ok: false,
        message: "Every item needs title, description, time, and price.",
      };
    }

    if (!localDateTime.test(scheduledAt) || Number.isNaN(new Date(scheduledAt).getTime())) {
      return { ok: false, message: "Every item needs a valid local date and time." };
    }

    const scheduledDate = scheduledAt.slice(0, 10);
    if (
      scheduledDate < reservation.arrivalDate ||
      scheduledDate > reservation.departureDate
    ) {
      return {
        ok: false,
        message: "Every item must be scheduled within the reservation dates.",
      };
    }

    items.push({ category: item.category, title, description, scheduledAt, price });
  }

  return {
    ok: true,
    value: {
      reservationId,
      note: typeof body.note === "string" ? body.note.trim() || null : null,
      items,
    },
  };
}
