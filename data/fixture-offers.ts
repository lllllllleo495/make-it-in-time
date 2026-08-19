import type {
  RescueSearchRequest,
  TransportMode,
  TravelOffer,
  TravelSegment,
} from "../lib/domain";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

function at(base: string, offset: number) {
  return new Date(Date.parse(base) + offset).toISOString();
}

function modeTitle(mode: TransportMode) {
  return {
    plane: "Прямой авиарейс",
    train: "Скоростной поезд",
    bus: "Междугородний автобус",
    suburban: "Пригородный поезд",
  }[mode];
}

function createOffer(
  request: RescueSearchRequest,
  configuration: {
    id: string;
    mode: TransportMode;
    departureOffset: number;
    duration: number;
    price: number;
    carrier: string;
    fromStation: string;
    fromPlaceId: string;
    toStation: string;
    seatsLeft: number;
  },
): TravelOffer {
  const departureAt = at(
    request.departure.readyFrom,
    configuration.departureOffset,
  );
  const arrivalAt = at(departureAt, configuration.duration);
  const segment: TravelSegment = {
    mode: configuration.mode,
    fromCity: request.incident.currentPlace.city,
    fromStation: configuration.fromStation,
    fromPlaceId: configuration.fromPlaceId,
    toCity: request.destination.city,
    toStation: configuration.toStation,
    departureAt,
    arrivalAt,
    carrier: configuration.carrier,
  };

  return {
    id: configuration.id,
    title: modeTitle(configuration.mode),
    segments: [segment],
    departureAt,
    arrivalAt,
    totalPrice: configuration.price * request.preferences.passengers,
    currency: "RUB",
    transferCount: 0,
    seatsLeft: configuration.seatsLeft,
    bookingUrl: "https://www.tutu.ru/",
    source: "fixture",
  };
}

export function getFixtureOffers(
  request: RescueSearchRequest,
): TravelOffer[] {
  const isPetersburgToMoscow =
    request.incident.currentPlace.city.toLowerCase().includes("петербург") &&
    request.destination.city.toLowerCase().includes("моск");

  const currentAirport = request.incident.currentPlace;
  const destinationAirport = request.destination.city.toLowerCase().includes("моск")
    ? "Шереметьево"
    : `Аэропорт ${request.destination.city}`;

  const directOffers = [
    createOffer(request, {
      id: "fixture-plane-fast",
      mode: "plane",
      departureOffset: 75 * MINUTE,
      duration: 95 * MINUTE,
      price: 12_480,
      carrier: "Аэрофлот",
      fromStation: currentAirport.name,
      fromPlaceId: currentAirport.id,
      toStation: destinationAirport,
      seatsLeft: 5,
    }),
    createOffer(request, {
      id: "fixture-plane-value",
      mode: "plane",
      departureOffset: 3 * HOUR,
      duration: 100 * MINUTE,
      price: 9_870,
      carrier: "Прямой рейс",
      fromStation: currentAirport.name,
      fromPlaceId: currentAirport.id,
      toStation: destinationAirport,
      seatsLeft: 8,
    }),
    createOffer(request, {
      id: "fixture-train",
      mode: "train",
      departureOffset: 2 * HOUR,
      duration: isPetersburgToMoscow ? 4 * HOUR + 5 * MINUTE : 18 * HOUR,
      price: 6_940,
      carrier: "РЖД",
      fromStation: isPetersburgToMoscow
        ? "Московский вокзал"
        : `Вокзал ${currentAirport.city}`,
      fromPlaceId: isPetersburgToMoscow
        ? "moskovsky-station"
        : `${currentAirport.city}-station`,
      toStation: isPetersburgToMoscow
        ? "Ленинградский вокзал"
        : `Вокзал ${request.destination.city}`,
      seatsLeft: 12,
    }),
    createOffer(request, {
      id: "fixture-bus",
      mode: "bus",
      departureOffset: 90 * MINUTE,
      duration: isPetersburgToMoscow ? 10 * HOUR : 22 * HOUR,
      price: 3_200,
      carrier: "Автобусный перевозчик",
      fromStation: `Автовокзал ${currentAirport.city}`,
      fromPlaceId: `${currentAirport.city}-bus-station`,
      toStation: `Автовокзал ${request.destination.city}`,
      seatsLeft: 16,
    }),
  ];

  if (isPetersburgToMoscow) return directOffers;

  const firstDeparture = at(request.departure.readyFrom, 2 * HOUR);
  const connectionArrival = at(firstDeparture, 3 * HOUR);
  const secondDeparture = at(connectionArrival, 75 * MINUTE);
  const finalArrival = at(secondDeparture, 2 * HOUR);

  return [
    ...directOffers,
    {
      id: "fixture-ready-made-composite",
      title: "Поезд + самолёт",
      segments: [
        {
          mode: "train",
          fromCity: request.incident.currentPlace.city,
          fromStation: `Вокзал ${request.incident.currentPlace.city}`,
          fromPlaceId: `${request.incident.currentPlace.city}-station`,
          toCity: "Москва",
          toStation: "Восточный вокзал",
          departureAt: firstDeparture,
          arrivalAt: connectionArrival,
          carrier: "РЖД",
        },
        {
          mode: "plane",
          fromCity: "Москва",
          fromStation: "Шереметьево",
          fromPlaceId: "sheremetyevo",
          toCity: request.destination.city,
          toStation: destinationAirport,
          departureAt: secondDeparture,
          arrivalAt: finalArrival,
          carrier: "Авиакомпания",
        },
      ],
      departureAt: firstDeparture,
      arrivalAt: finalArrival,
      totalPrice: 14_900 * request.preferences.passengers,
      currency: "RUB",
      transferCount: 1,
      seatsLeft: 4,
      bookingUrl: "https://www.tutu.ru/",
      source: "fixture",
    },
  ];
}
