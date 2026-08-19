import { z } from "zod";

export const transportModeSchema = z.enum([
  "plane",
  "train",
  "bus",
  "suburban",
]);

export type TransportMode = z.infer<typeof transportModeSchema>;

export const rescueSearchRequestSchema = z
  .object({
    incident: z.object({
      currentPlace: z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        city: z.string().min(1),
        type: z.enum(["airport", "station"]),
      }),
      disruptionType: z.enum(["cancelled", "delayed"]),
      newDeparture: z.string().datetime().optional(),
    }),
    destination: z.object({
      city: z.string().min(1),
      arrivalDeadline: z.string().datetime(),
    }),
    departure: z.object({
      readyFrom: z.string().datetime(),
      allowOtherPlaces: z.boolean(),
    }),
    preferences: z.object({
      passengers: z.number().int().min(1).max(9),
      modes: z.array(transportModeSchema).min(1),
      priority: z.enum(["fastest", "cheapest", "fewest_transfers"]),
      maxPrice: z.number().positive().optional(),
      maxTransfers: z.number().int().min(0).max(3),
    }),
  })
  .superRefine((request, context) => {
    const readyFrom = Date.parse(request.departure.readyFrom);
    const deadline = Date.parse(request.destination.arrivalDeadline);

    if (readyFrom >= deadline) {
      context.addIssue({
        code: "custom",
        path: ["destination", "arrivalDeadline"],
        message: "Дедлайн должен быть позже времени готовности к отправлению",
      });
    }

    if (
      request.incident.disruptionType === "delayed" &&
      !request.incident.newDeparture
    ) {
      context.addIssue({
        code: "custom",
        path: ["incident", "newDeparture"],
        message: "Укажите новое время отправления",
      });
    }

  });

export type RescueSearchRequest = z.infer<typeof rescueSearchRequestSchema>;

export type TravelSegment = {
  mode: TransportMode;
  fromCity: string;
  fromStation: string;
  fromPlaceId: string;
  toCity: string;
  toStation: string;
  departureAt: string;
  arrivalAt: string;
  carrier: string;
  voyageNumber?: string;
};

export type TravelOffer = {
  id: string;
  title: string;
  segments: TravelSegment[];
  departureAt: string;
  arrivalAt: string;
  totalPrice: number;
  transferCount: number;
  seatsLeft?: number;
  bookingUrl: string;
  searchResultsUrl?: string;
  checkoutRef?: Record<string, unknown>;
  baggageDescription?: string;
  source: "fixture" | "tutu-mcp";
};

export type ResultCategory = "fastest" | "cheapest" | "fewest_transfers";

export type RescueOption = TravelOffer & {
  category: ResultCategory;
  deadlineMarginMinutes: number;
};

export type CurrentJourneyStatus = "fits" | "misses" | "unknown" | "cancelled";

export type SupportContact = {
  id: string;
  type: "airline" | "airport" | "seller";
  name: string;
  description: string;
  phone?: string;
  hours?: string;
  websiteUrl: string;
  supportUrl?: string;
  sourceUrl: string;
  lastVerifiedAt: string;
};

export type SearchResponse = {
  options: RescueOption[];
  rejectedCount: number;
  currentJourneyStatus: CurrentJourneyStatus;
  searchedAt: string;
  dataSource: "fixture" | "tutu-mcp";
  support: {
    contacts: SupportContact[];
    actionPlan: string[];
  };
};
