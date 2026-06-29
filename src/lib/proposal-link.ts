import type { ProposalDetail } from "@/lib/types";

const SNAPSHOT_PARAM = "snapshot";

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isProposalDetail(value: unknown): value is ProposalDetail {
  if (!value || typeof value !== "object") return false;
  const proposal = value as Partial<ProposalDetail>;
  return (
    typeof proposal.id === "number" &&
    typeof proposal.reservationId === "number" &&
    typeof proposal.status === "string" &&
    !!proposal.member &&
    !!proposal.reservation &&
    Array.isArray(proposal.items) &&
    typeof proposal.total === "number"
  );
}

export function encodeProposalSnapshot(proposal: ProposalDetail) {
  return base64UrlEncode(JSON.stringify(proposal));
}

export function decodeProposalSnapshot(value: string | null): ProposalDetail | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(value)) as unknown;
    return isProposalDetail(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function proposalHref(proposal: ProposalDetail) {
  return `/proposal/${proposal.id}?${SNAPSHOT_PARAM}=${encodeProposalSnapshot(proposal)}`;
}

export function proposalUrl(proposal: ProposalDetail, baseUrl: string) {
  return new URL(proposalHref(proposal), baseUrl).toString();
}

export function proposalSnapshotParam() {
  return SNAPSHOT_PARAM;
}
