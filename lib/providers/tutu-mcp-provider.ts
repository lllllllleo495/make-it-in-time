import type {
  RescueSearchRequest,
  TransportMode,
  TravelOffer,
  TravelSegment,
} from "../domain";
import { TutuMcpClient, TutuMcpError } from "./tutu-mcp-client";
import type { TravelProvider } from "./travel-provider";

type TutuMode = "avia" | "railway" | "bus" | "etrain";

type TutuSearchResponse = {
  offers?: unknown;
};

type TutuOffer = {
  offer_id?: unknown;
  transport?: unknown;
  price?: { amount?: unknown };
  departure_at?: unknown;
  arrival_at?: unknown;
  carriers?: unknown;
  checkout_url?: unknown;
  search_results_url?: unknown;
  checkout_ref?: unknown;
  variants?: unknown;
  legs?: unknown;
};

type TutuSegment = {
  from?: unknown;
  to?: unknown;
  departure_at?: unknown;
  arrival_at?: unknown;
  carrier?: unknown;
  voyage_no?: unknown;
  from_geo_point_id?: unknown;
};

type TutuCheckoutResponse = {
  checkout_url?: unknown;
  search_results_url?: unknown;
  fallback_url?: unknown;
  fallback_note?: unknown;
  kind?: unknown;
};

const TUTU_MODE_BY_PRODUCT_MODE: Record<TransportMode, TutuMode> = {
  plane: "avia",
  train: "railway",
  bus: "bus",
  suburban: "etrain",
};

const TOOL_BY_TUTU_MODE: Record<TutuMode, string> = {
  avia: "search_avia",
  railway: "search_rail",
  bus: "search_bus",
  etrain: "search_etrain",
};

const PRODUCT_MODE_BY_TUTU_MODE: Record<TutuMode, TransportMode> = {
  avia: "plane",
  railway: "train",
  bus: "bus",
  etrain: "suburban",
};

export class TutuMcpTravelProvider implements TravelProvider {
  readonly source = "tutu-mcp" as const;

  constructor(private readonly client = new TutuMcpClient()) {}

  async search(request: RescueSearchRequest): Promise<TravelOffer[]> {
    const origin = request.departure.allowOtherPlaces
      ? request.incident.currentPlace.city
      : request.incident.currentPlace.name;
    const departureDate = request.departure.readyFrom.slice(0, 10);
    const selectedModes = Array.from(
      new Set(
        request.preferences.modes.map(
          (mode) => TUTU_MODE_BY_PRODUCT_MODE[mode],
        ),
      ),
    );

    try {
      const responses = await Promise.all(
        selectedModes.map(async (mode) => {
          const response = await this.client.callTool<TutuSearchResponse>(
            TOOL_BY_TUTU_MODE[mode],
            searchArguments(mode, {
              origin,
              destination: request.destination.city,
              departureDate,
              passengers: request.preferences.passengers,
              maxPrice: request.preferences.maxPrice,
              maxTransfers: request.preferences.maxTransfers,
            }),
          );

          return normalizeSearchResponse(response, mode, request);
        }),
      );

      return responses.flat();
    } catch (cause) {
      if (cause instanceof TutuMcpError) throw cause;
      throw new TutuMcpError("Не удалось получить предложения Tutu MCP", cause);
    }
  }

  async createCheckoutLink(checkoutRef: Record<string, unknown>) {
    const response = await this.client.callTool<TutuCheckoutResponse>(
      "create_checkout_link",
      checkoutRef,
    );
    const url =
      optionalString(response.checkout_url) ??
      optionalString(response.search_results_url) ??
      optionalString(response.fallback_url);

    if (!url) {
      throw new TutuMcpError("Tutu MCP не вернул ссылку для выбранного предложения");
    }

    return {
      url,
      kind: optionalString(response.kind),
      fallbackNote: optionalString(response.fallback_note),
    };
  }
}

function searchArguments(
  mode: TutuMode,
  options: {
    origin: string;
    destination: string;
    departureDate: string;
    passengers: number;
    maxPrice?: number;
    maxTransfers: number;
  },
) {
  const shared = {
    origin: options.origin,
    destination: options.destination,
    departure_date: options.departureDate,
    page_size: 30,
    sort: "departure_asc",
    view: "compact",
    direct_only: options.maxTransfers === 0,
    ...(options.maxPrice === undefined ? {} : { price_max: options.maxPrice }),
  };

  if (mode === "avia") {
    return { ...shared, adults: options.passengers };
  }

  if (mode === "bus") {
    return { ...shared, adults: options.passengers };
  }

  if (mode === "railway") {
    return { ...shared, passengers: Math.min(options.passengers, 6) };
  }

  return shared;
}

function normalizeSearchResponse(
  response: TutuSearchResponse,
  mode: TutuMode,
  request: RescueSearchRequest,
): TravelOffer[] {
  if (!Array.isArray(response.offers)) {
    throw new TutuMcpError("Tutu MCP вернул ответ без списка предложений");
  }

  return response.offers.map((offer, index) =>
    normalizeOffer(offer, mode, request, index),
  );
}

function normalizeOffer(
  rawOffer: unknown,
  requestedMode: TutuMode,
  request: RescueSearchRequest,
  index: number,
): TravelOffer {
  if (!isRecord(rawOffer)) {
    throw new TutuMcpError("Tutu MCP вернул некорректное предложение");
  }

  const offer = rawOffer as TutuOffer;
  const mode = productMode(offer.transport, requestedMode);
  const id = requiredString(offer.offer_id, "id предложения");
  const departureAt = requiredDate(offer.departure_at, "время отправления");
  const arrivalAt = requiredDate(offer.arrival_at, "время прибытия");
  const totalPrice = requiredPrice(offer.price);
  const segments = normalizeSegments(offer.legs, mode, request);

  if (segments.length === 0) {
    throw new TutuMcpError(`Предложение ${id} не содержит сегментов`);
  }

  return {
    id: `${mode}-${id}-${index}`,
    title: titleFor(mode, offer.carriers),
    segments,
    departureAt,
    arrivalAt,
    totalPrice,
    transferCount: Math.max(0, segments.length - 1),
    bookingUrl:
      optionalString(offer.checkout_url) ??
      requiredString(offer.search_results_url, "ссылка на результаты поиска"),
    searchResultsUrl: optionalString(offer.search_results_url),
    checkoutRef: recordOrUndefined(offer.checkout_ref),
    baggageDescription: baggageDescription(offer.variants),
    source: "tutu-mcp",
  };
}

function normalizeSegments(
  rawLegs: unknown,
  mode: TransportMode,
  request: RescueSearchRequest,
): TravelSegment[] {
  if (!Array.isArray(rawLegs)) {
    throw new TutuMcpError("У предложения Tutu MCP отсутствуют детали маршрута");
  }

  const segments = rawLegs.flatMap((rawLeg) => {
    if (!isRecord(rawLeg) || !Array.isArray(rawLeg.segments)) return [];
    return rawLeg.segments;
  });

  return segments.map((rawSegment) => {
    if (!isRecord(rawSegment)) {
      throw new TutuMcpError("Tutu MCP вернул некорректный сегмент маршрута");
    }

    const segment = rawSegment as TutuSegment;
    const fromStation = requiredString(segment.from, "точка отправления");
    const toStation = requiredString(segment.to, "точка прибытия");

    return {
      mode,
      fromCity: cityFromPlace(fromStation),
      fromStation,
      fromPlaceId: request.departure.allowOtherPlaces
        ? String(segment.from_geo_point_id ?? fromStation)
        : request.incident.currentPlace.id,
      toCity: cityFromPlace(toStation),
      toStation,
      departureAt: requiredDate(segment.departure_at, "время отправления сегмента"),
      arrivalAt: requiredDate(segment.arrival_at, "время прибытия сегмента"),
      carrier: optionalString(segment.carrier) ?? "Не указан",
      voyageNumber: optionalString(segment.voyage_no),
    };
  });
}

function baggageDescription(variants: unknown) {
  if (!Array.isArray(variants) || !isRecord(variants[0])) return undefined;
  const conditions = variants[0].conditions;
  if (!isRecord(conditions) || !isRecord(conditions.baggage)) return undefined;

  const baggage = conditions.baggage;
  const kilograms = typeof baggage.kg === "number" ? baggage.kg : undefined;
  const pieces = typeof baggage.pieces === "number" ? baggage.pieces : undefined;
  if (kilograms && kilograms > 0) return `Багаж: ${kilograms} кг`;
  if (pieces && pieces > 0) return `Багаж: ${pieces} место`;
  if (kilograms === 0 || pieces === 0) return "Только ручная кладь";
  return undefined;
}

function productMode(value: unknown, fallback: TutuMode): TransportMode {
  if (value === "avia" || value === "railway" || value === "bus" || value === "etrain") {
    return PRODUCT_MODE_BY_TUTU_MODE[value];
  }
  return PRODUCT_MODE_BY_TUTU_MODE[fallback];
}

function titleFor(mode: TransportMode, carriers: unknown) {
  const carrier = Array.isArray(carriers)
    ? carriers.find((value): value is string => typeof value === "string")
    : undefined;
  const modeName = {
    plane: "Авиарейс",
    train: "Поезд",
    bus: "Автобус",
    suburban: "Электричка",
  }[mode];
  return carrier ? `${modeName} · ${carrier}` : modeName;
}

function cityFromPlace(place: string) {
  return place.split(/[—,]/, 1)[0]?.trim() || place;
}

function requiredString(value: unknown, field: string) {
  const result = optionalString(value);
  if (!result) throw new TutuMcpError(`Tutu MCP не вернул ${field}`);
  return result;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function recordOrUndefined(value: unknown) {
  return isRecord(value) ? value : undefined;
}

function requiredDate(value: unknown, field: string) {
  const result = requiredString(value, field);
  if (Number.isNaN(Date.parse(result))) {
    throw new TutuMcpError(`Tutu MCP вернул некорректное ${field}`);
  }
  return result;
}

function requiredPrice(value: unknown) {
  if (!isRecord(value) || typeof value.amount !== "number" || value.amount <= 0) {
    throw new TutuMcpError("Tutu MCP не вернул корректную цену");
  }
  return value.amount;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
