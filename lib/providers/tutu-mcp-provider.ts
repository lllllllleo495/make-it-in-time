import type {
  RescueSearchRequest,
  TransportMode,
  TravelOffer,
  TravelSegment,
} from "../domain";
import type { TravelProvider } from "./travel-provider";

const DEFAULT_MCP_URL = "https://mcp.tutu.ru/mcp";
const MAX_SEARCH_DATES = 3;
const REQUEST_TIMEOUT_MS = 20_000;

const MCP_MODE_BY_TRANSPORT: Record<TransportMode, TutuTransport> = {
  plane: "avia",
  train: "railway",
  bus: "bus",
  suburban: "etrain",
};

const TRANSPORT_BY_MCP_MODE: Record<TutuTransport, TransportMode> = {
  avia: "plane",
  railway: "train",
  bus: "bus",
  etrain: "suburban",
};

const MODE_TITLE: Record<TransportMode, string> = {
  plane: "Самолёт",
  train: "Поезд",
  bus: "Автобус",
  suburban: "Электричка",
};

type TutuTransport = "avia" | "railway" | "bus" | "etrain";

type TutuMoney = {
  amount?: number;
  currency?: string;
};

type TutuFareVariant = {
  price?: TutuMoney;
  conditions?: {
    fare_family?: string;
    baggage?: { kg?: number | null; pieces?: number | null };
    cabin_baggage?: {
      kg?: number | null;
      pieces?: number | null;
      dimensions?: string | null;
    };
  };
};

type TutuSegment = {
  from?: string;
  to?: string;
  departure_at?: string;
  arrival_at?: string;
  carrier?: string;
  voyage_no?: string;
  from_geo_point_id?: number | string;
  to_geo_point_id?: number | string;
  vehicle_meta?: { name?: string };
};

type TutuLeg = {
  from?: string;
  to?: string;
  departure_at?: string;
  arrival_at?: string;
  segments?: TutuSegment[];
};

type TutuOffer = {
  offer_id?: string;
  transport?: TutuTransport | "rail";
  price?: TutuMoney;
  carriers?: string[];
  segments_count?: number;
  departure_at?: string;
  arrival_at?: string;
  legs?: TutuLeg[];
  variants?: TutuFareVariant[];
  fares?: {
    price_from?: number;
    currency?: string;
  };
  seats_left?: number;
  checkout_url?: string;
  search_results_url?: string;
};

type TutuSearchResponse = {
  variants?: TutuOffer[];
  meta?: {
    has_more?: boolean;
    unavailable?: Array<{ mode?: string; reason?: string } | string>;
  };
};

type JsonRpcResponse<Result> = {
  result?: Result;
  error?: { code?: number; message?: string; data?: unknown };
};

type McpToolResult = {
  isError?: boolean;
  structuredContent?: unknown;
  content?: Array<{ type?: string; text?: string }>;
};

function normalizeRailTransport(transport: TutuOffer["transport"]): TutuTransport | undefined {
  if (transport === "rail") return "railway";
  return transport;
}

function toLocalDate(iso: string, timezoneOffsetMinutes = 0) {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return undefined;
  return new Date(timestamp - timezoneOffsetMinutes * 60_000)
    .toISOString()
    .slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getSearchDates(request: RescueSearchRequest) {
  const offset = request.incident.timezoneOffsetMinutes ?? 0;
  const first = toLocalDate(request.departure.readyFrom, offset);
  const last = toLocalDate(request.destination.arrivalDeadline, offset);
  if (!first || !last) return [];

  const dates: string[] = [];
  for (let index = 0; index < MAX_SEARCH_DATES; index += 1) {
    const date = addDays(first, index);
    if (date > last) break;
    dates.push(date);
  }
  return dates;
}

function parseMcpPayload(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("event:") && !trimmed.startsWith("data:")) {
    return JSON.parse(trimmed) as JsonRpcResponse<McpToolResult>;
  }

  const data = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .find((line) => line && line !== "[DONE]");
  if (!data) throw new Error("Tutu MCP вернул пустой поток данных");
  return JSON.parse(data) as JsonRpcResponse<McpToolResult>;
}

function getToolPayload(result: McpToolResult): unknown {
  if (result.isError) {
    const errorText = result.content?.find((item) => item.type === "text")?.text;
    throw new Error(errorText || "Tutu MCP не выполнил поиск");
  }
  if (result.structuredContent !== undefined) return result.structuredContent;

  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("Tutu MCP вернул ответ без данных");
  return JSON.parse(text) as unknown;
}

class TutuMcpClient {
  constructor(private readonly endpoint = process.env.TUTU_MCP_URL || DEFAULT_MCP_URL) {}

  async callTool<Payload>(name: string, args: Record<string, unknown>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "tools/call",
          params: { name, arguments: args },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Tutu MCP ответил с кодом ${response.status}`);
      }

      const rpc = parseMcpPayload(await response.text());
      if (rpc.error) throw new Error(rpc.error.message || "Ошибка Tutu MCP");
      if (!rpc.result) throw new Error("Tutu MCP вернул пустой ответ");
      return getToolPayload(rpc.result) as Payload;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Tutu MCP не ответил вовремя");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function cleanPointName(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function extractCity(point: string | undefined, fallback: string) {
  if (!point) return fallback;
  return point.split(/\s+[—–-]\s+|,/)[0]?.trim() || fallback;
}

function samePoint(point: string, request: RescueSearchRequest) {
  const normalized = point.toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
  const placeName = request.incident.currentPlace.name
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е");
  return normalized.includes(placeName);
}

function describeLuggage(variant: TutuFareVariant | undefined) {
  const baggage = variant?.conditions?.baggage;
  const cabin = variant?.conditions?.cabin_baggage;
  if ((baggage?.pieces ?? 0) > 0 || (baggage?.kg ?? 0) > 0) {
    const amount = baggage?.kg ? `${baggage.kg} кг` : `${baggage?.pieces} место`;
    return `Багаж: ${amount}`;
  }
  if ((cabin?.pieces ?? 0) > 0 || (cabin?.kg ?? 0) > 0 || cabin?.dimensions) {
    const details = [
      cabin?.kg ? `${cabin.kg} кг` : undefined,
      cabin?.pieces ? `${cabin.pieces} место` : undefined,
      cabin?.dimensions || undefined,
    ].filter(Boolean);
    return `Ручная кладь${details.length ? `: ${details.join(", ")}` : ""}`;
  }
  if (baggage?.pieces === 0 || baggage?.kg === 0) return "Без багажа";
  return undefined;
}

function chooseAviaFare(offer: TutuOffer, request: RescueSearchRequest) {
  const priced = (offer.variants ?? []).filter(
    (variant) => typeof variant.price?.amount === "number",
  );
  if (!priced.length) return undefined;

  const matching = priced.filter((variant) => {
    const baggage = variant.conditions?.baggage;
    const cabin = variant.conditions?.cabin_baggage;
    if (request.preferences.baggage === "checked") {
      return (baggage?.pieces ?? 0) > 0 || (baggage?.kg ?? 0) > 0;
    }
    if (request.preferences.baggage === "carry_on") {
      return (
        (cabin?.pieces ?? 0) > 0 ||
        (cabin?.kg ?? 0) > 0 ||
        Boolean(cabin?.dimensions)
      );
    }
    return true;
  });

  return [...matching].sort(
    (left, right) => (left.price?.amount ?? Infinity) - (right.price?.amount ?? Infinity),
  )[0];
}

function makeSegments(
  offer: TutuOffer,
  mode: TransportMode,
  request: RescueSearchRequest,
): TravelSegment[] {
  const rawSegments = (offer.legs ?? []).flatMap((leg) => {
    if (leg.segments?.length) return leg.segments;
    return [
      {
        from: leg.from,
        to: leg.to,
        departure_at: leg.departure_at,
        arrival_at: leg.arrival_at,
      },
    ];
  });

  return rawSegments.flatMap((segment, index): TravelSegment[] => {
    const departureAt = segment.departure_at || offer.departure_at;
    const arrivalAt = segment.arrival_at || offer.arrival_at;
    if (!departureAt || !arrivalAt) return [];

    const fromStation = cleanPointName(
      segment.from,
      index === 0 ? request.incident.currentPlace.city : "Точка пересадки",
    );
    const toStation = cleanPointName(
      segment.to,
      index === rawSegments.length - 1 ? request.destination.city : "Точка пересадки",
    );
    const fromPlaceId =
      index === 0 && samePoint(fromStation, request)
        ? request.incident.currentPlace.id
        : `tutu:${segment.from_geo_point_id ?? fromStation}`;

    return [
      {
        mode,
        fromCity: extractCity(fromStation, request.incident.currentPlace.city),
        fromStation,
        fromPlaceId,
        toCity: extractCity(toStation, request.destination.city),
        toStation,
        departureAt,
        arrivalAt,
        carrier: segment.carrier || offer.carriers?.join(", ") || "Перевозчик не указан",
        voyageNumber: segment.voyage_no,
        vehicleName: segment.vehicle_meta?.name,
      },
    ];
  });
}

export function normalizeTutuOffer(
  offer: TutuOffer,
  request: RescueSearchRequest,
): TravelOffer | undefined {
  const transport = normalizeRailTransport(offer.transport);
  if (!transport) return undefined;
  const mode = TRANSPORT_BY_MCP_MODE[transport];
  if (!mode || !request.preferences.modes.includes(mode)) return undefined;

  const selectedFare = transport === "avia" ? chooseAviaFare(offer, request) : undefined;
  if (
    transport === "avia" &&
    request.preferences.baggage &&
    !selectedFare
  ) {
    return undefined;
  }

  const segments = makeSegments(offer, mode, request);
  const departureAt = offer.departure_at || segments[0]?.departureAt;
  const arrivalAt = offer.arrival_at || segments.at(-1)?.arrivalAt;
  const amount =
    selectedFare?.price?.amount ?? offer.price?.amount ?? offer.fares?.price_from;
  if (!segments.length || !departureAt || !arrivalAt || typeof amount !== "number") {
    return undefined;
  }

  const currency =
    selectedFare?.price?.currency || offer.price?.currency || offer.fares?.currency || "RUB";
  const bookingUrl = offer.checkout_url || offer.search_results_url;
  const transferCount = Math.max(0, (offer.segments_count ?? segments.length) - 1);
  const title = transferCount
    ? `${MODE_TITLE[mode]} · ${transferCount} перес.`
    : MODE_TITLE[mode];

  return {
    id: `tutu-${transport}-${offer.offer_id || `${departureAt}-${arrivalAt}`}`,
    title,
    segments,
    departureAt,
    arrivalAt,
    totalPrice: amount,
    currency,
    priceIsFrom: transport === "railway",
    transferCount,
    seatsLeft: offer.seats_left,
    bookingUrl,
    fareName: selectedFare?.conditions?.fare_family,
    luggageSummary: transport === "avia" ? describeLuggage(selectedFare) : undefined,
    source: "tutu-mcp",
  };
}

export class TutuMcpTravelProvider implements TravelProvider {
  readonly source = "tutu-mcp" as const;

  constructor(private readonly client = new TutuMcpClient()) {}

  async search(request: RescueSearchRequest): Promise<TravelOffer[]> {
    const modes = request.preferences.modes.map((mode) => MCP_MODE_BY_TRANSPORT[mode]);
    const dates = getSearchDates(request);
    if (!dates.length) return [];

    const responses = await Promise.all(
      dates.map((departureDate) =>
        this.client.callTool<TutuSearchResponse>("search_multitransport", {
          origin: request.incident.currentPlace.city,
          destination: request.destination.city,
          departure_date: departureDate,
          adults: request.preferences.passengers,
          modes,
          optimize_for: "time",
          page: 1,
          page_size: 30,
          price_max: request.preferences.maxPrice,
          direct_only: request.preferences.maxTransfers === 0,
          view: "compact",
        }),
      ),
    );

    return responses.flatMap((response) =>
      (response.variants ?? []).flatMap((offer) => {
        const normalized = normalizeTutuOffer(offer, request);
        return normalized ? [normalized] : [];
      }),
    );
  }
}
