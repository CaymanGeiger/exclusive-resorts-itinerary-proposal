import type { ProposalDetail } from "@/lib/types";
import { dateRange, dateTime, money } from "@/lib/format";

type ResendEmailPayload = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type ProposalEmailResult = {
  enabled: boolean;
  sent: boolean;
  deliveredToOverride: boolean;
  resendEmailId?: string;
  error?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function truncate(value: string, maxLength = 1000) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function getSender() {
  return (
    process.env.PROPOSAL_FROM_EMAIL ??
    process.env.BETA_ACCESS_FROM_EMAIL ??
    process.env.PASSWORD_RESET_FROM_EMAIL ??
    "Exclusive Resorts <onboarding@resend.dev>"
  );
}

function getProposalUrl(proposal: ProposalDetail, requestOrigin?: string) {
  const baseUrl = requestOrigin ?? process.env.PROPOSAL_BASE_URL ?? "http://localhost:3015";
  return new URL(`/proposal/${proposal.id}`, baseUrl).toString();
}

function getRecipient(proposal: ProposalDetail) {
  return process.env.PROPOSAL_EMAIL_TO_OVERRIDE ?? proposal.member.email;
}

function proposalEmailText(proposal: ProposalDetail, proposalUrl: string) {
  const lines = [
    `${proposal.member.name},`,
    "",
    `Your ${proposal.reservation.villa} itinerary proposal is ready for review.`,
    `${proposal.reservation.destination}`,
    dateRange(proposal.reservation.arrivalDate, proposal.reservation.departureDate),
    "",
    proposal.note ?? "",
    "",
    "Itinerary:",
    ...proposal.items.map(
      (item) => `- ${dateTime(item.scheduledAt)}: ${item.title} (${money(item.price)})`,
    ),
    "",
    `Estimated total: ${money(proposal.total)}`,
    "",
    `Review, approve, and lock it in: ${proposalUrl}`,
  ];

  return lines.filter((line, index) => line || lines[index - 1]).join("\n");
}

function proposalEmailHtml(proposal: ProposalDetail, proposalUrl: string) {
  const items = proposal.items
    .map(
      (item) => `
        <tr>
          <td style="padding: 14px 0; border-bottom: 1px solid #e4e1da;">
            <div style="font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #6f8a74;">${escapeHtml(item.category)}</div>
            <div style="margin-top: 4px; font-size: 17px; font-weight: 700; color: #17344a;">${escapeHtml(item.title)}</div>
            <div style="margin-top: 4px; color: #69746e; line-height: 1.6;">${escapeHtml(item.description)}</div>
            <div style="margin-top: 8px; color: #17344a;">${escapeHtml(dateTime(item.scheduledAt))} · ${escapeHtml(money(item.price))}</div>
          </td>
        </tr>`,
    )
    .join("");

  return `
    <div style="margin:0; padding:0; background:#f5f7f2; font-family:Arial, sans-serif; color:#17211c;">
      <div style="max-width:680px; margin:0 auto; padding:40px 24px;">
        <p style="margin:0; font-size:12px; letter-spacing:.12em; text-transform:uppercase; color:#6f8a74; font-weight:700;">Exclusive Resorts Proposal</p>
        <h1 style="margin:12px 0 8px; color:#17344a; font-size:32px; line-height:1.2;">${escapeHtml(proposal.reservation.villa)} itinerary</h1>
        <p style="margin:0; color:#69746e;">${escapeHtml(proposal.reservation.destination)} · ${escapeHtml(dateRange(proposal.reservation.arrivalDate, proposal.reservation.departureDate))}</p>
        <div style="margin-top:28px; padding:24px; background:#ffffff; border:1px solid #dfe5dd;">
          <p style="margin:0 0 16px; line-height:1.7;">${escapeHtml(proposal.member.name)}, your itinerary proposal is ready for review.</p>
          ${
            proposal.note
              ? `<p style="margin:0 0 18px; padding-left:14px; border-left:4px solid #b38a41; color:#69746e; line-height:1.7;">${escapeHtml(proposal.note)}</p>`
              : ""
          }
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            ${items}
          </table>
          <div style="margin-top:22px; display:flex; justify-content:space-between; gap:18px; align-items:center;">
            <span style="color:#69746e;">Estimated total</span>
            <strong style="font-size:24px; color:#17344a;">${escapeHtml(money(proposal.total))}</strong>
          </div>
          <a href="${escapeHtml(proposalUrl)}" style="display:inline-block; margin-top:24px; padding:14px 18px; background:#17344a; color:#ffffff; text-decoration:none; font-weight:700;">Review proposal</a>
        </div>
      </div>
    </div>`;
}

export async function sendProposalEmail(
  proposal: ProposalDetail,
  requestOrigin?: string,
): Promise<ProposalEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = getRecipient(proposal);
  const deliveredToOverride = to !== proposal.member.email;

  if (!apiKey) {
    console.warn(
      `Resend email disabled for proposal ${proposal.id}; RESEND_API_KEY is not configured.`,
    );
    return { enabled: false, sent: false, deliveredToOverride };
  }

  const proposalUrl = getProposalUrl(proposal, requestOrigin);
  const payload: ResendEmailPayload = {
    from: getSender(),
    to,
    subject: `${proposal.reservation.villa} itinerary proposal is ready`,
    html: proposalEmailHtml(proposal, proposalUrl),
    text: proposalEmailText(proposal, proposalUrl),
  };

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Resend request error.";
    console.error(`Resend request failed for proposal ${proposal.id}: ${message}`);
    return { enabled: true, sent: false, deliveredToOverride, error: message };
  }

  const responseBody = await response.text();
  if (!response.ok) {
    console.error(
      `Resend rejected proposal ${proposal.id} email status=${response.status} body=${truncate(responseBody)}`,
    );
    return {
      enabled: true,
      sent: false,
      deliveredToOverride,
      error: `Resend rejected email with status ${response.status}.`,
    };
  }

  let resendEmailId: string | undefined;
  try {
    const parsed = JSON.parse(responseBody) as { id?: unknown };
    resendEmailId = typeof parsed.id === "string" ? parsed.id : undefined;
  } catch {
    resendEmailId = undefined;
  }

  console.log(
    `Resend accepted proposal ${proposal.id} email deliveredToOverride=${deliveredToOverride} resendEmailId=${resendEmailId ?? "not-provided"}`,
  );

  return { enabled: true, sent: true, deliveredToOverride, resendEmailId };
}
