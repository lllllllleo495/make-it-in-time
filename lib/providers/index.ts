import type { TravelProvider } from "./travel-provider";
import { TutuMcpTravelProvider } from "./tutu-mcp-provider";

export function getTravelProvider(): TravelProvider {
  return new TutuMcpTravelProvider();
}
