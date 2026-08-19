import type { RescueSearchRequest, TravelOffer } from "../domain";

export interface TravelProvider {
  readonly source: TravelOffer["source"];
  search(request: RescueSearchRequest): Promise<TravelOffer[]>;
  createCheckoutLink?(
    checkoutRef: Record<string, unknown>,
  ): Promise<{ url: string; kind?: string; fallbackNote?: string }>;
}
