import type { RescueSearchRequest, SupportContact } from "../lib/domain";

const contacts: SupportContact[] = [
  {
    id: "aeroflot",
    type: "airline",
    name: "Аэрофлот",
    description:
      "Уточнить статус рейса и доступные варианты переоформления.",
    phone: "+7 800 444-55-55",
    hours: "Круглосуточно",
    websiteUrl: "https://www.aeroflot.ru/",
    supportUrl: "https://www.aeroflot.ru/ru-ru/help",
    sourceUrl: "https://pulkovoairport.ru/passengers/destinations/airlines/",
    lastVerifiedAt: "2026-08-19",
  },
  {
    id: "pulkovo",
    type: "airport",
    name: "Аэропорт Пулково",
    description: "Проверить табло и получить общую справочную информацию.",
    phone: "+7 812 324-30-00",
    hours: "Круглосуточно",
    websiteUrl: "https://pulkovoairport.ru/",
    supportUrl: "https://pulkovoairport.ru/about/contacts/",
    sourceUrl: "https://pulkovoairport.ru/about/contacts/",
    lastVerifiedAt: "2026-08-19",
  },
  {
    id: "tutu",
    type: "seller",
    name: "Туту",
    description:
      "Открыть заказ, написать в чат и уточнить порядок обмена или возврата.",
    phone: "+7 800 511-55-63",
    hours: "Круглосуточно",
    websiteUrl: "https://www.tutu.ru/",
    supportUrl: "https://www.tutu.ru/feedback.php",
    sourceUrl:
      "https://www.tutu.ru/2read/legal_information/general_oferta/",
    lastVerifiedAt: "2026-08-19",
  },
];

export function getSupportBundle(request: RescueSearchRequest) {
  const requestedIds = new Set([
    request.incident.currentPlace.id,
    request.incident.airlineId,
    request.incident.sellerId,
  ]);
  const selected = contacts.filter((contact) => requestedIds.has(contact.id));

  return {
    contacts: selected,
    actionPlan: [
      "Проверьте актуальный статус исходного рейса на табло аэропорта.",
      "Свяжитесь с авиакомпанией и уточните доступную замену рейса.",
      "Если билет куплен через агрегатора, откройте заказ и запросите условия обмена или возврата.",
      "Сравните ответ перевозчика с найденными вариантами и ещё раз проверьте наличие мест перед оформлением.",
    ],
  };
}
