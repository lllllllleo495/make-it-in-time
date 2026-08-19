import { getSupportBundle } from "../../../data/support-providers";
import { rescueSearchRequestSchema, type SearchResponse } from "../../../lib/domain";
import { getTravelProvider } from "../../../lib/providers";
import {
  assessCurrentJourney,
  filterOffers,
  selectRescueOptions,
} from "../../../lib/search";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = rescueSearchRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
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
  const offers = await provider.search(parsed.data);
  const filteredOffers = filterOffers(offers, parsed.data);
  const options = selectRescueOptions(filteredOffers, parsed.data);

  const response: SearchResponse = {
    options,
    rejectedCount: offers.length - filteredOffers.length,
    currentJourneyStatus: assessCurrentJourney(parsed.data),
    searchedAt: new Date().toISOString(),
    dataSource: provider.source,
    support: getSupportBundle(parsed.data),
  };

  return Response.json(response);
}
