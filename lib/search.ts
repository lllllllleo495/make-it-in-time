import type {
  CurrentJourneyStatus,
  RescueOption,
  RescueSearchRequest,
  ResultCategory,
  TravelOffer,
} from "./domain";

const categorySorters: Record<
  ResultCategory,
  (left: TravelOffer, right: TravelOffer) => number
> = {
  fastest: (left, right) =>
    Date.parse(left.arrivalAt) - Date.parse(right.arrivalAt) ||
    left.totalPrice - right.totalPrice,
  cheapest: (left, right) =>
    left.totalPrice - right.totalPrice ||
    Date.parse(left.arrivalAt) - Date.parse(right.arrivalAt),
  fewest_transfers: (left, right) =>
    left.transferCount - right.transferCount ||
    Date.parse(left.arrivalAt) - Date.parse(right.arrivalAt),
};

function offerKey(offer: TravelOffer) {
  return [
    offer.segments.map((segment) => segment.mode).join("+"),
    offer.segments[0]?.fromStation,
    offer.segments.at(-1)?.toStation,
    offer.departureAt,
    offer.arrivalAt,
    offer.totalPrice,
  ].join("|");
}

export function filterOffers(
  offers: TravelOffer[],
  request: RescueSearchRequest,
) {
  const readyFrom = Date.parse(request.departure.readyFrom);
  const deadline = Date.parse(request.destination.arrivalDeadline);

  return offers.filter((offer) => {
    const departsInTime = Date.parse(offer.departureAt) >= readyFrom;
    const arrivesInTime = Date.parse(offer.arrivalAt) <= deadline;
    const respectsBudget =
      request.preferences.maxPrice === undefined ||
      offer.totalPrice <= request.preferences.maxPrice;
    const respectsTransfers =
      offer.transferCount <= request.preferences.maxTransfers;
    const respectsModes = offer.segments.every((segment) =>
      request.preferences.modes.includes(segment.mode),
    );
    const respectsOrigin =
      request.departure.allowOtherPlaces ||
      offer.segments[0]?.fromPlaceId === request.incident.currentPlace.id;

    return (
      departsInTime &&
      arrivesInTime &&
      respectsBudget &&
      respectsTransfers &&
      respectsModes &&
      respectsOrigin
    );
  });
}

export function selectRescueOptions(
  offers: TravelOffer[],
  request: RescueSearchRequest,
): RescueOption[] {
  const uniqueOffers = Array.from(
    new Map(offers.map((offer) => [offerKey(offer), offer])).values(),
  );

  const categories: ResultCategory[] = [
    request.preferences.priority,
    "fastest",
    "cheapest",
    "fewest_transfers",
  ].filter(
    (category, index, values): category is ResultCategory =>
      values.indexOf(category) === index,
  );

  const selected: RescueOption[] = [];
  const selectedIds = new Set<string>();
  const deadline = Date.parse(request.destination.arrivalDeadline);

  for (const category of categories) {
    const next = [...uniqueOffers]
      .sort(categorySorters[category])
      .find((offer) => !selectedIds.has(offer.id));

    if (!next) continue;

    selectedIds.add(next.id);
    selected.push({
      ...next,
      category,
      deadlineMarginMinutes: Math.max(
        0,
        Math.floor((deadline - Date.parse(next.arrivalAt)) / 60_000),
      ),
    });

    if (selected.length === 3) break;
  }

  return selected;
}

export function assessCurrentJourney(
  request: RescueSearchRequest,
): CurrentJourneyStatus {
  if (request.incident.disruptionType === "cancelled") return "cancelled";

  const deadline = Date.parse(request.destination.arrivalDeadline);

  if (request.incident.expectedArrival) {
    return Date.parse(request.incident.expectedArrival) <= deadline
      ? "fits"
      : "misses";
  }

  if (
    request.incident.newDeparture &&
    Date.parse(request.incident.newDeparture) >= deadline
  ) {
    return "misses";
  }

  return "unknown";
}
