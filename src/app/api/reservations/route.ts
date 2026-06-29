import { jsonError } from "@/lib/api";
import { listReservations } from "@/lib/db";

export const runtime = "nodejs";

export function GET() {
  const reservations = listReservations();
  const reservation = reservations[0] ?? null;
  if (!reservation) return jsonError("Reservation not found.", 404);
  return Response.json({ reservation, reservations });
}
