import { FixtureTravelProvider } from "./fixture-provider";
import type { TravelProvider } from "./travel-provider";

export function getTravelProvider(): TravelProvider {
  // Локальный MVP работает на воспроизводимом провайдере. Адаптер Tutu MCP
  // подключается здесь и обязан вернуть тот же TravelOffer-контракт.
  return new FixtureTravelProvider();
}
