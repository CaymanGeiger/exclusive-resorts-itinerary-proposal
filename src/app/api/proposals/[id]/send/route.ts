import { jsonError, parseId } from "@/lib/api";
import { sendProposal } from "@/lib/db";
import { sendProposalEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return jsonError("Invalid proposal id.");
  const result = sendProposal(id);
  if (result.error) return jsonError(result.error, result.status);
  if (!result.proposal) return jsonError("Proposal not found.", 404);

  const email = await sendProposalEmail(result.proposal, new URL(request.url).origin);
  if (email.enabled && !email.sent) {
    return jsonError("Proposal marked sent, but Resend delivery failed. Check server logs.", 502);
  }

  return Response.json({ proposal: result.proposal, email });
}
