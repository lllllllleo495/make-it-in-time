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
      currentTime: z.string().datetime(),
      disruptionType: z.enum(["cancelled", "delayed"]),
      scheduledDeparture: z.string().datetime().optional(),
      newDeparture: z.string().datetime().optional(),
      expectedArrival: z.string().datetime().optional(),
      flightNumber: z.string().max(16).optional(),
      airlineId: z.string().optional(),
      sellerId: z.string().optional(),
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
      baggage: z.enum(["none", "carry_on", "checked"]).optional(),
      modes: z.array(transportModeSchema).min(1),
      priority: z.enum(["fastest", "cheapest", "fewest_transfers"]),
      maxPrice: z.number().positive().optional(),
      maxTransfers: z.number().int().min(0).max(3),
    }),
  })
  .superRefine((request, context) => {
    const currentTime = Date.parse(request.incident.currentTime);
    const readyFrom = Date.parse(request.departure.readyFrom);
    const deadline = Date.parse(request.destination.arrivalDeadline);

    if (readyFrom < currentTime) {
      context.addIssue({
        code: "custom",
        path: ["departure", "readyFrom"],
        message: "Время готовности не может быть раньше текущего времени",
      });
    }

    if (readyFrom >= deadline) {
      context.addIssue({
        code: "custom",
        path: ["destination", "arrivalDeadline"],
        message: "Дедлайн должен быть позже времени готовности к отправлению",
      });
    }

    if (
      request.incident.newDeparture &&
      request.incident.scheduledDeparture &&
      Date.parse(request.incident.newDeparture) <
        Date.parse(request.incident.scheduledDeparture)
    ) {
      context.addIssue({
        code: "custom",
        path: ["incident", "newDeparture"],
        message: "Новое время вылета не может быть раньше исходного",
      });
    }

    if (
      request.incident.expectedArrival &&
      request.incident.newDeparture &&
      Date.parse(request.incident.expectedArrival) <
        Date.parse(request.incident.newDeparture)
    ) {
      context.addIssue({
        code: "custom",
        path: ["incident", "expectedArrival"],
        message: "Время прибытия должно быть позже нового времени вылета",
      });
    }
  });

export type RescueSearchRequest = z.infer<typeof rescueSearchRequestSchema>;

export const supportRequestSchema = z.object({
  currentPlaceId: z.string().min(1),
  disruptionType: z.enum(["cancelled", "delayed"]),
  flightNumber: z.string().trim().max(16).optional(),
  airlineId: z.string().optional(),
  sellerId: z.string().optional(),
});

export type SupportRequest = z.infer<typeof supportRequestSchema>;

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
  source: "fixture" | "tutu-mcp";
};

export type ResultCategory = "fastest" | "cheapest" | "fewest_transfers";

export type RescueOption = TravelOffer & {
  category: ResultCategory;
  deadlineMarginMinutes: number;
};

export type MissedOption = TravelOffer & {
  missedDeadlineByMinutes: number;
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
  nearestAfterDeadline?: MissedOption;
  rejectedCount: number;
  currentJourneyStatus: CurrentJourneyStatus;
  searchedAt: string;
  dataSource: "fixture" | "tutu-mcp";
  support: {
    contacts: SupportContact[];
    actionPlan: string[];
  };
};
