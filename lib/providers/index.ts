import { FixtureTravelProvider } from "./fixture-provider";
import { TutuMcpTravelProvider } from "./tutu-mcp-provider";
import type { TravelProvider } from "./travel-provider";

export function getTravelProvider(): TravelProvider {
  if (process.env.TRAVEL_PROVIDER === "fixture") {
    return new FixtureTravelProvider();
  }
  return new TutuMcpTravelProvider();
}
