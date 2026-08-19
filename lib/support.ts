import supportData from "../data/support-data.json";
import type {
  RescueSearchRequest,
  SupportAction,
  SupportRequest,
  SupportResponse,
} from "./domain";

type SupportLinks = {
  main?: string;
  flightStatus?: string;
  manageBooking?: string;
  contact?: string;
  orders?: string;
  refund?: string;
  departures?: string;
};

type DirectoryEntity = {
  id: string;
  name: string;
  support: SupportLinks;
  directContact?: {
    type: "phone" | "email" | "web";
    value: string;
    label: string;
    href: string;
  };
  source?: { url: string; verifiedAt: string };
};

type SupportDirectory = {
  airlines: DirectoryEntity[];
  sellers: DirectoryEntity[];
  locations: Array<DirectoryEntity & { type: string; city: string }>;
};

const directory = supportData as SupportDirectory;

function firstUrl(entity: DirectoryEntity, keys: Array<keyof SupportLinks>) {
  for (const key of keys) {
    const url = entity.support[key];
    if (url) return url;
  }
  return undefined;
}

function airlineActionLabel(airline: DirectoryEntity) {
  const genitiveNames: Record<string, string> = {
    aeroflot: "Аэрофлота",
    pobeda: "Победы",
    s7: "S7 Airlines",
    ural: "Уральских авиалиний",
    nordwind: "Nordwind Airlines",
    rossiya: "авиакомпании «Россия»",
  };
  return `Проверить у ${genitiveNames[airline.id] ?? airline.name}`;
}

function contactFields(entity: DirectoryEntity, fallbackUrl: string) {
  if (entity.directContact) {
    return {
      contactType: entity.directContact.type,
      contactValue: entity.directContact.value,
      contactLabel: entity.directContact.label,
      contactHref: entity.directContact.href,
    } as const;
  }
  return {
    contactType: "web" as const,
    contactValue: `Официальная поддержка ${entity.name}`,
    contactLabel: "Открыть",
    contactHref: fallbackUrl,
  };
}

export function getSupportActions(
  context: SupportRequest,
  data: SupportDirectory = directory,
): SupportResponse {
  const actions: SupportAction[] = [];
  const misses: SupportResponse["misses"] = [];

  if (context.airlineId) {
    const airline = data.airlines.find((item) => item.id === context.airlineId);
    const url = airline && firstUrl(airline, ["flightStatus", "contact", "main"]);
    if (airline && url) {
      actions.push({
        id: `flight-status-${airline.id}`,
        priority: 1,
        category: "flight_status",
        entityType: "airline",
        entityId: airline.id,
        entityName: airline.name,
        title: `Уточните статус у ${airline.name}`,
        description: "Спросите об актуальном времени вылета и доступных вариантах пересадки.",
        actionLabel: airlineActionLabel(airline),
        url,
        ...contactFields(airline, url),
        verifiedAt: airline.source?.verifiedAt,
      });
    } else {
      misses.push({ entityType: "airline", entityId: context.airlineId });
    }
  }

  if (context.sellerId) {
    const seller = data.sellers.find((item) => item.id === context.sellerId);
    const url = seller && firstUrl(seller, ["orders", "refund", "contact", "main"]);
    if (seller && url) {
      actions.push({
        id: `ticket-${seller.id}`,
        priority: 2,
        category: "ticket",
        entityType: "seller",
        entityId: seller.id,
        entityName: seller.name,
        title: `Запросите обмен или возврат у ${seller.name}`,
        description: seller.id === "aviasales"
          ? "Если билет куплен напрямую — откройте «Мои заказы». Если у партнёра — его контакты указаны в билете."
          : `Билет оформлен через ${seller.name}, поэтому изменение заказа нужно согласовать с продавцом.`,
        actionLabel: `Открыть ${seller.name}`,
        url,
        ...contactFields(seller, url),
        verifiedAt: seller.source?.verifiedAt,
      });
    } else {
      misses.push({ entityType: "seller", entityId: context.sellerId });
    }
  }

  const location = data.locations.find((item) => item.id === context.currentPlaceId);
  const locationUrl = location && firstUrl(location, ["departures", "contact", "main"]);
  if (location && locationUrl) {
    const isAirport = location.type === "airport";
    actions.push({
      id: `location-${location.id}`,
      priority: 3,
      category: "location",
      entityType: "location",
      entityId: location.id,
      entityName: location.name,
      title: isAirport ? `Уточните ситуацию в ${location.name}` : `Уточните ситуацию на ${location.name}`,
      description: isAirport
        ? "Справочная подскажет актуальное табло и где найти стойку информации."
        : "Справочная подскажет актуальное расписание и где получить помощь.",
      actionLabel: isAirport ? `Открыть табло ${location.name}` : `Открыть ${location.name}`,
      url: locationUrl,
      ...contactFields(location, locationUrl),
      verifiedAt: location.source?.verifiedAt,
    });
  } else {
    misses.push({ entityType: "location", entityId: context.currentPlaceId });
  }

  return {
    actions: actions.sort((left, right) => left.priority - right.priority),
    misses,
    departureTime: context.departureTime,
  };
}

export function getSupportForSearch(request: RescueSearchRequest) {
  return getSupportActions({
    currentPlaceId: request.incident.currentPlace.id,
    disruptionType: request.incident.disruptionType,
    airlineId: request.incident.airlineId,
    sellerId: request.incident.sellerId,
  });
}

export { directory as supportDirectory };
