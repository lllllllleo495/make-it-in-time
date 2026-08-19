import type { Metadata } from "next";
import { RescueApp } from "./RescueApp";

export const metadata: Metadata = {
  title: "Успеть — экстренный поиск маршрута",
  description:
    "До трёх вариантов, которые по расписанию прибывают в нужный город до вашего дедлайна.",
  openGraph: {
    title: "Успеть — план Б после срыва рейса",
    description:
      "Сравним самолёты, поезда и автобусы и оставим только варианты до вашего дедлайна.",
    images: [{ url: "/og-uspet-v3.png", width: 1672, height: 941 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Успеть — план Б после срыва рейса",
    description: "До трёх билетов, которые прибывают вовремя по расписанию.",
    images: ["/og-uspet-v3.png"],
  },
};

export default function Home() {
  return <RescueApp />;
}
