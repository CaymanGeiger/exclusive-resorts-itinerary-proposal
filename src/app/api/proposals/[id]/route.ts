import { jsonError, parseId, readJsonObject } from "@/lib/api";
import {
  getProposal,
  sendProposal,
  updateDraftProposal,
  updateStatus,
  validStatus,
} from "@/lib/db";
import { sendProposalEmail } from "@/lib/email";
import { parseProposalDraftInput } from "@/lib/proposal-validation";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return jsonError("Invalid proposal id.");
  const proposal = getProposal(id);
  if (!proposal) return jsonError("Proposal not found.", 404);
  return Response.json({ proposal });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return jsonError("Invalid proposal id.");

  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  if ("status" in body.body) {
    if (!validStatus(body.body.status)) {
      return jsonError("Status must be sent, approved, or paid.");
    }

    const result =
      body.body.status === "sent"
        ? sendProposal(id)
        : updateStatus(id, body.body.status);
    if (result.error) return jsonError(result.error, result.status);
    if (!result.proposal) return jsonError("Proposal not found.", 404);

    if (body.body.status === "sent") {
      const email = await sendProposalEmail(result.proposal, new URL(request.url).origin);
      if (email.enabled && !email.sent) {
        return jsonError(
          "Proposal marked sent, but Resend delivery failed. Check server logs.",
          502,
        );
      }
      return Response.json({ proposal: result.proposal, email });
    }

    return Response.json({ proposal: result.proposal });
  }

  const existing = getProposal(id);
  if (!existing) return jsonError("Proposal not found.", 404);
  if (existing.status !== "draft") {
    return jsonError("Only draft proposals can be edited.", 409);
  }

  const draft = parseProposalDraftInput(body.body);
  if (!draft.ok) return jsonError(draft.message, draft.status);

  const proposal = updateDraftProposal(id, draft.value);
  if (!proposal) return jsonError("Proposal not found.", 404);
  return Response.json({ proposal });
}
