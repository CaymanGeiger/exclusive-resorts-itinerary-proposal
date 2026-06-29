import { connection } from "next/server";
import { MemberProposal } from "@/components/MemberProposal";
import { getProposal } from "@/lib/db";

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const proposalId = Number(id);
  return (
    <MemberProposal
      proposalId={id}
      initialProposal={
        Number.isInteger(proposalId) && proposalId > 0
          ? getProposal(proposalId)
          : null
      }
    />
  );
}
