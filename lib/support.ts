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
  help?: string;
  orders?: string;
  refund?: string;
  departures?: string;
  board?: string;
  phone?: string | null;
  phoneAlt?: string | null;
  shortPhone?: string | null;
  disruptionPhone?: string | null;
  phoneNote?: string | null;
  disruptionPhoneNote?: string | null;
  email?: string | null;
};

type DirectoryEntity = {
  id: string;
  name: string;
  support: SupportLinks;
  source?: { url: string; verifiedAt: string };
};

type SupportDirectory = {
  airlines: DirectoryEntity[];
  sellers: DirectoryEntity[];
  airports: Array<DirectoryEntity & { type: string; city: string }>;
};

const directory = supportData as SupportDirectory;

function firstUrl(entity: DirectoryEntity, keys: Array<keyof SupportLinks>) {
  for (const key of keys) {
    const url = entity.support[key];
    if (url) return url;
  }
  return undefined;
}

function phoneHref(value: string) {
  return `tel:${value.replace(/[^\d+*]/g, "")}`;
}

function contactFields(entity: DirectoryEntity) {
  const contacts: SupportAction["contacts"] = [];
  const addPhone = (value: string | null | undefined, label: string) => {
    if (!value) return;
    contacts.push({ type: "phone", label, value, href: phoneHref(value) });
  };

  addPhone(entity.support.phone, "Телефон");
  addPhone(entity.support.phoneAlt, "Дополнительный");
  addPhone(entity.support.shortPhone, "Короткий номер");
  addPhone(entity.support.disruptionPhone, "При отмене или задержке");
  if (entity.support.email) {
    contacts.push({
      type: "email",
      label: "Почта",
      value: entity.support.email,
      href: `mailto:${entity.support.email}`,
    });
  }

  const contactNote = [entity.support.phoneNote, entity.support.disruptionPhoneNote]
    .filter(Boolean)
    .join(". ");
  return {
    contacts,
    contactNote: contactNote || undefined,
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
    const url = airline && firstUrl(airline, ["flightStatus", "contact", "help", "main"]);
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
        actionLabel: "Открыть сайт",
        url,
        ...contactFields(airline),
        verifiedAt: airline.source?.verifiedAt,
      });
    } else {
      misses.push({ entityType: "airline", entityId: context.airlineId });
    }
  }

  if (context.sellerId) {
    const seller = data.sellers.find((item) => item.id === context.sellerId);
    const url = seller && firstUrl(seller, ["orders", "refund", "contact", "help", "main"]);
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
        actionLabel: "Открыть сайт",
        url,
        ...contactFields(seller),
        verifiedAt: seller.source?.verifiedAt,
      });
    } else {
      misses.push({ entityType: "seller", entityId: context.sellerId });
    }
  }

  const location = data.airports.find((item) => item.id === context.currentPlaceId);
  const locationUrl = location && firstUrl(location, ["board", "departures", "contact", "main"]);
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
      actionLabel: "Открыть сайт",
      url: locationUrl,
      ...contactFields(location),
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
