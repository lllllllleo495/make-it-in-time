import type { RescueSearchRequest, TravelOffer } from "../domain";

export interface TravelProvider {
  readonly source: TravelOffer["source"];
  search(request: RescueSearchRequest): Promise<TravelOffer[]>;
}
