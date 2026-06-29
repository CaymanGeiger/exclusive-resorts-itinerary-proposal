export type ProposalStatus = "draft" | "sent" | "approved" | "paid";

export type ItineraryCategory =
  | "Dining"
  | "Activities"
  | "Wellness"
  | "Excursions"
  | "Transport"
  | "Experiences";

export type ProposalItemInput = {
  category: ItineraryCategory;
  title: string;
  description: string;
  scheduledAt: string;
  price: number;
};

export type ProposalDraftInput = {
  reservationId: number;
  note: string | null;
  items: ProposalItemInput[];
};

export type ReservationContext = {
  id: number;
  memberId: number;
  destination: string;
  villa: string;
  arrivalDate: string;
  departureDate: string;
  member: {
    id: number;
    name: string;
    email: string;
  };
};

export type ProposalItem = ProposalItemInput & {
  id: number;
  proposalId: number;
};

export type ProposalSummary = {
  id: number;
  reservationId: number;
  status: ProposalStatus;
  note: string | null;
  createdAt: string;
  sentAt: string | null;
  memberName: string;
  memberEmail: string;
  destination: string;
  villa: string;
  arrivalDate: string;
  departureDate: string;
  itemCount: number;
  total: number;
};

export type ProposalDetail = {
  id: number;
  reservationId: number;
  status: ProposalStatus;
  note: string | null;
  createdAt: string;
  sentAt: string | null;
  member: {
    id: number;
    name: string;
    email: string;
  };
  reservation: Omit<ReservationContext, "member">;
  items: ProposalItem[];
  sentEmails: Array<{
    id: number;
    proposalId: number;
    toEmail: string;
    sentAt: string;
    bodyPreview: string;
  }>;
  total: number;
};
