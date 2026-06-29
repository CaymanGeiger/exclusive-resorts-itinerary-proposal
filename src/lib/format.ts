import type { ProposalItem } from "@/lib/types";

export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export const date = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));

export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

export const time = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

export const dateRange = (arrival: string, departure: string) =>
  `${date(arrival).replace(", 2026", "")} - ${date(departure)}`;

export function groupByDay(items: ProposalItem[]) {
  return items.reduce<Record<string, ProposalItem[]>>((groups, item) => {
    const key = item.scheduledAt.slice(0, 10);
    groups[key] = [...(groups[key] ?? []), item];
    return groups;
  }, {});
}
