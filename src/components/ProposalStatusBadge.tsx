import {
  CheckCircle2,
  CreditCard,
  PencilLine,
  Send,
  type LucideIcon,
} from "lucide-react";
import type { ProposalStatus } from "@/lib/types";

const statusMeta: Record<
  ProposalStatus,
  {
    className: string;
    Icon: LucideIcon;
    label: string;
  }
> = {
  draft: {
    className: "border-[#b9b0a3] bg-[#eee8dd] text-[#4f4941]",
    Icon: PencilLine,
    label: "Draft",
  },
  sent: {
    className: "border-[#8fb8d8] bg-[#e5f2fb] text-[#1f5f88]",
    Icon: Send,
    label: "Sent",
  },
  approved: {
    className: "border-[#8fc7a0] bg-[#e1f5e8] text-[#25633f]",
    Icon: CheckCircle2,
    label: "Approved",
  },
  paid: {
    className: "border-[#d4a642] bg-[#fff0bf] text-[#81520e]",
    Icon: CreditCard,
    label: "Paid",
  },
};

export function ProposalStatusBadge({
  status,
  className = "",
}: {
  status: ProposalStatus;
  className?: string;
}) {
  const { className: statusClassName, Icon, label } = statusMeta[status];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.04em] ${statusClassName} ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
