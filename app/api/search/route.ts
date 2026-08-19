import { getSupportBundle } from "../../../data/support-providers";
import {
  rescueSearchRequestSchema,
  type SearchResponse,
  type TravelOffer,
} from "../../../lib/domain";
import { getTravelProvider } from "../../../lib/providers";
import {
  assessCurrentJourney,
  findNearestAfterDeadline,
  filterOffers,
  selectRescueOptions,
} from "../../../lib/search";
import { corsPreflight, jsonWithCors } from "../../../lib/http";

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = rescueSearchRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonWithCors(
      request,
      {
        error: "Проверьте исходные данные",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const provider = getTravelProvider();
  let offers: TravelOffer[];
  try {
    offers = await provider.search(parsed.data);
  } catch {
    return jsonWithCors(
      request,
      { error: "Не удалось загрузить расписание. Попробуйте ещё раз." },
      { status: 502 },
    );
  }
  const filteredOffers = filterOffers(offers, parsed.data);
  const options = selectRescueOptions(filteredOffers, parsed.data);

  const response: SearchResponse = {
    options,
    nearestAfterDeadline: findNearestAfterDeadline(offers, parsed.data),
    rejectedCount: offers.length - filteredOffers.length,
    currentJourneyStatus: assessCurrentJourney(parsed.data),
    searchedAt: new Date().toISOString(),
    dataSource: provider.source,
    support: getSupportBundle(parsed.data),
  };

  return jsonWithCors(request, response);
}
