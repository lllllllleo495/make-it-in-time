import { getFixtureOffers } from "../../data/fixture-offers";
import type { RescueSearchRequest, TravelOffer } from "../domain";
import type { TravelProvider } from "./travel-provider";

export class FixtureTravelProvider implements TravelProvider {
  readonly source = "fixture" as const;

  async search(request: RescueSearchRequest): Promise<TravelOffer[]> {
    return getFixtureOffers(request);
  }
}
