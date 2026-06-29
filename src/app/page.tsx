import { connection } from "next/server";
import { ConciergeDashboard } from "@/components/ConciergeDashboard";
import { listProposals, listReservations } from "@/lib/db";

export default async function Home() {
  await connection();
  return (
    <ConciergeDashboard
      initialReservations={listReservations()}
      initialProposals={listProposals()}
    />
  );
}
