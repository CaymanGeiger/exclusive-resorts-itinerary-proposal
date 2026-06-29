import type { ItineraryCategory } from "@/lib/types";

export const CATEGORIES = [
  {
    name: "Dining",
    icon: "Utensils",
    examples: "Private chef dinner, restaurant reservation",
    title: "Private chef dinner",
    description:
      "A chef-led dinner at the villa featuring coastal Mexican seafood and paired wines.",
    scheduledAt: "2026-03-16T19:00",
    price: 1800,
  },
  {
    name: "Activities",
    icon: "Waves",
    examples: "Surf lesson, snorkeling, ATV tour",
    title: "Private surf lesson",
    description: "Morning surf instruction with a local guide and board setup.",
    scheduledAt: "2026-03-17T09:30",
    price: 450,
  },
  {
    name: "Wellness",
    icon: "Flower2",
    examples: "Spa treatment, yoga session, massage",
    title: "In-villa massage",
    description: "A restorative 90-minute massage arranged on the terrace.",
    scheduledAt: "2026-03-18T10:00",
    price: 320,
  },
  {
    name: "Excursions",
    icon: "Sailboat",
    examples: "Whale watching, sailing charter, cultural tour",
    title: "Sunset sailing charter",
    description: "A private charter with light bites, champagne, and coastline views.",
    scheduledAt: "2026-03-19T16:30",
    price: 2400,
  },
  {
    name: "Transport",
    icon: "Car",
    examples: "Airport transfer, private car, helicopter",
    title: "Private airport transfer",
    description: "Round-trip luxury SUV transfer between the airport and villa.",
    scheduledAt: "2026-03-15T14:00",
    price: 260,
  },
  {
    name: "Experiences",
    icon: "Sunset",
    examples: "Sunset cocktails, bonfire on the beach, tequila tasting",
    title: "Beach bonfire and tequila tasting",
    description: "A hosted evening with reserve tequila, dessert, and acoustic music.",
    scheduledAt: "2026-03-20T20:00",
    price: 950,
  },
] as const satisfies Array<{
  name: ItineraryCategory;
  icon: string;
  examples: string;
  title: string;
  description: string;
  scheduledAt: string;
  price: number;
}>;

export function isCategory(value: unknown): value is ItineraryCategory {
  return typeof value === "string" && CATEGORIES.some((item) => item.name === value);
}

export function defaultsFor(category: ItineraryCategory) {
  return CATEGORIES.find((item) => item.name === category) ?? CATEGORIES[0];
}
