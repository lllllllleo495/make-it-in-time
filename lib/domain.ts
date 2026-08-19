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
      timezoneOffsetMinutes: z.number().int().min(-840).max(840).optional(),
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
      passengers: z.number().int().min(1).max(6),
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
  disruptionType: z.enum(["cancelled", "delayed"]).optional(),
  departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  airlineId: z.string().optional(),
  sellerId: z.string().optional(),
});

export type SupportRequest = z.infer<typeof supportRequestSchema>;

export const checkoutRequestSchema = z.object({
  checkoutRef: z.record(z.string(), z.unknown()),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

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
  vehicleName?: string;
};

export type TravelOffer = {
  id: string;
  title: string;
  segments: TravelSegment[];
  departureAt: string;
  arrivalAt: string;
  totalPrice: number;
  currency?: string;
  priceIsFrom?: boolean;
  transferCount: number;
  seatsLeft?: number;
  bookingUrl?: string;
  checkoutRef?: Record<string, unknown>;
  fareName?: string;
  luggageSummary?: string;
  source: "fixture" | "tutu-mcp";
};

export type ResultCategory = "fastest" | "cheapest" | "fewest_transfers" | "fastest_within_budget";

export type RescueOption = TravelOffer & {
  category: ResultCategory;
  deadlineMarginMinutes: number;
};

export type MissedOption = TravelOffer & {
  missedDeadlineByMinutes: number;
};

export type CurrentJourneyStatus = "fits" | "misses" | "unknown" | "cancelled";

export type SupportAction = {
  id: string;
  priority: number;
  category: "flight_status" | "ticket" | "location";
  entityType: "airline" | "seller" | "location";
  entityId: string;
  entityName: string;
  title: string;
  description: string;
  actionLabel: string;
  url: string;
  contacts: Array<{
    type: "phone" | "email";
    label: string;
    value: string;
    href: string;
  }>;
  contactNote?: string;
  verifiedAt?: string;
};

export type SupportResponse = {
  actions: SupportAction[];
  misses: Array<{
    entityType: "airline" | "seller" | "location";
    entityId: string;
  }>;
  departureTime?: string;
};

export type SearchResponse = {
  options: RescueOption[];
  nearestAfterDeadline?: MissedOption;
  rejectedCount: number;
  currentJourneyStatus: CurrentJourneyStatus;
  searchedAt: string;
  dataSource: "fixture" | "tutu-mcp";
  support: SupportResponse;
};
