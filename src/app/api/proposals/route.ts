import { jsonError, readJsonObject } from "@/lib/api";
import { createProposal, listProposals } from "@/lib/db";
import { parseProposalDraftInput } from "@/lib/proposal-validation";

export const runtime = "nodejs";

export function GET() {
  return Response.json({ proposals: listProposals() });
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  const draft = parseProposalDraftInput(body.body);
  if (!draft.ok) return jsonError(draft.message, draft.status);

  const proposal = createProposal(draft.value);

  return Response.json({ proposal }, { status: 201 });
}
