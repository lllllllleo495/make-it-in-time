"use client";

import { useState } from "react";
import type {
  RescueOption,
  RescueSearchRequest,
  SearchResponse,
  TransportMode,
} from "../lib/domain";

type PlaceOption = RescueSearchRequest["incident"]["currentPlace"];

const PLACES: PlaceOption[] = [
  { id: "pulkovo", name: "Пулково", city: "Санкт-Петербург", type: "airport" },
  { id: "sheremetyevo", name: "Шереметьево", city: "Москва", type: "airport" },
  { id: "sochi-airport", name: "Аэропорт Сочи", city: "Сочи", type: "airport" },
  { id: "moskovsky-station", name: "Московский вокзал", city: "Санкт-Петербург", type: "station" },
];

const MODE_ICONS: Record<TransportMode, string> = {
  plane: "✈",
  train: "🚆",
  bus: "🚌",
  suburban: "🚊",
};

type FormState = {
  placeId: string;
  destinationCity: string;
  arrivalDeadline: string;
  passengers: number;
  maxPrice: string;
  allowOtherPlaces: boolean;
};

const DEMO: FormState = {
  placeId: "pulkovo",
  destinationCity: "Москва",
  arrivalDeadline: "2026-08-19T18:00",
  passengers: 1,
  maxPrice: "",
  allowOtherPlaces: false,
};

function toIso(value: string) {
  return new Date(value).toISOString();
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours ? `${hours} ч${remaining ? ` ${remaining} мин` : ""}` : `${remaining} мин`;
}

function buildRequest(form: FormState): RescueSearchRequest {
  const place = PLACES.find((item) => item.id === form.placeId);
  if (!place) throw new Error("Выберите, где вы сейчас");

  const now = new Date().toISOString();
  return {
    incident: {
      currentPlace: place,
      disruptionType: "cancelled",
    },
    destination: {
      city: form.destinationCity.trim(),
      arrivalDeadline: toIso(form.arrivalDeadline),
    },
    departure: {
      readyFrom: now,
      allowOtherPlaces: form.allowOtherPlaces,
    },
    preferences: {
      passengers: form.passengers,
      modes: ["plane", "train", "bus", "suburban"],
      priority: "fastest",
      maxPrice: form.maxPrice ? Number(form.maxPrice) : undefined,
      maxTransfers: 3,
    },
  };
}

export function MinimalRescueApp() {
  const [form, setForm] = useState<FormState>(DEMO);
  const [phase, setPhase] = useState<"form" | "filters" | "searching" | "results">("form");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  function setField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function search(nextForm = form) {
    setError(null);
    setPhase("searching");

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildRequest(nextForm)),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.issues?.[0]?.message || payload.error || "Не удалось найти варианты");
      setResult(payload as SearchResponse);
      setPhase("results");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось найти варианты. Попробуйте ещё раз.");
      setPhase("form");
    }
  }

  function startAgain() {
    setResult(null);
    setError(null);
    setPhase("form");
  }

  function expandSearch() {
    const nextForm = { ...form, allowOtherPlaces: true };
    setForm(nextForm);
    void search(nextForm);
  }

  async function openOffer(option: RescueOption) {
    if (!option.checkoutRef) {
      window.location.assign(option.bookingUrl);
      return;
    }

    setOpeningId(option.id);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checkoutRef: option.checkoutRef }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось открыть билет");
      window.location.assign(payload.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось открыть билет");
    } finally {
      setOpeningId(null);
    }
  }

  const place = PLACES.find((item) => item.id === form.placeId);

  return (
    <main className="minimal-app">
      <header className="minimal-header">
        <a className="minimal-brand" href="#top"><span>У</span>Успеть</a>
        <p>Поиск альтернативных билетов на Туту</p>
      </header>

      <section className="minimal-hero" id="top">
        <p className="minimal-kicker">Если рейс сорвался</p>
        <h1>Найдём способ<br />успеть.</h1>
        <p>Покажем только билеты, которые по расписанию прибывают до вашего дедлайна.</p>
      </section>

      {phase === "form" && (
        <section className="rescue-card" aria-labelledby="rescue-title">
          <div className="rescue-card-title">
            <span>01</span>
            <div><p>Только самое важное</p><h2 id="rescue-title">Куда нужно успеть?</h2></div>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); setPhase("filters"); }}>
            <div className="minimal-fields">
              <label className="minimal-field"><span>Я сейчас</span><select value={form.placeId} onChange={(event) => setField("placeId", event.target.value)}>{PLACES.map((item) => <option value={item.id} key={item.id}>{item.name}, {item.city}</option>)}</select></label>
              <label className="minimal-field"><span>Нужно попасть в</span><input list="minimal-cities" required value={form.destinationCity} onChange={(event) => setField("destinationCity", event.target.value)} /><datalist id="minimal-cities"><option value="Москва" /><option value="Санкт-Петербург" /><option value="Сочи" /><option value="Казань" /></datalist></label>
              <label className="minimal-field deadline-input"><span>Не позже</span><input type="datetime-local" required value={form.arrivalDeadline} onChange={(event) => setField("arrivalDeadline", event.target.value)} /></label>
            </div>
            <div className="rescue-card-footer">
              <span className="from-now">Отправление — с текущего момента</span>
              <button className="rescue-button" type="submit">Далее <span>→</span></button>
            </div>
          </form>
        </section>
      )}

      {phase === "filters" && (
        <section className="rescue-card filters-card" aria-labelledby="filters-title">
          <div className="rescue-card-title"><span>02</span><div><p>Настройте поиск</p><h2 id="filters-title">Параметры поездки</h2></div></div>
          <div className="filter-grid">
            <PassengerCounter value={form.passengers} onChange={(value) => setField("passengers", value)} />
            <label className="minimal-field"><span>Бюджет на всех, до</span><input type="number" min="1" placeholder="Без ограничения" value={form.maxPrice} onChange={(event) => setField("maxPrice", event.target.value)} /></label>
            <div className="baggage-note"><strong>Багаж</strong><span>Покажем условия в карточке, если Туту вернул их для выбранного тарифа.</span></div>
          </div>
          <div className="rescue-card-footer">
            <button className="back-search" type="button" onClick={() => setPhase("form")}>← Назад</button>
            <button className="rescue-button" type="button" onClick={() => void search()}>Искать билеты <span>→</span></button>
          </div>
          {error && <div className="minimal-error" role="alert">{error}<button type="button" onClick={() => void search()}>Повторить</button></div>}
        </section>
      )}

      {phase === "searching" && <SearchingState destination={form.destinationCity} />}
      {phase === "results" && result && <Results result={result} form={form} place={place} error={error} openingId={openingId} onOpenOffer={openOffer} onStartAgain={startAgain} onExpandSearch={expandSearch} />}

      <footer className="minimal-footer">Данные о билетах — Туту MCP. Мы не рассчитываем дорогу до аэропорта или вокзала.</footer>
    </main>
  );
}

function PassengerCounter({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="passenger-counter"><span>Пассажиры</span><div><button type="button" disabled={value === 1} onClick={() => onChange(value - 1)}>−</button><strong>{value}</strong><button type="button" disabled={value === 9} onClick={() => onChange(value + 1)}>+</button></div></div>;
}

function SearchingState({ destination }: { destination: string }) {
  const modes: TransportMode[] = ["plane", "train", "bus", "suburban"];
  return <section className="searching-card" aria-live="polite">
    <p className="minimal-kicker">Туту MCP ищет</p>
    <h2>Сравниваем все пути<br />в {destination}</h2>
    <div className="searching-routes">{modes.map((mode, index) => <div style={{ animationDelay: `${index * 160}ms` }} key={mode}><span>{MODE_ICONS[mode]}</span><i /></div>)}</div>
    <p>Проверяем время прибытия каждого варианта.</p>
  </section>;
}

function Results({ result, form, place, error, openingId, onOpenOffer, onStartAgain, onExpandSearch }: { result: SearchResponse; form: FormState; place?: PlaceOption; error: string | null; openingId: string | null; onOpenOffer: (option: RescueOption) => void; onStartAgain: () => void; onExpandSearch: () => void }) {
  return <section className="minimal-results" aria-live="polite">
    <div className="result-summary">
      <p className="minimal-kicker">Результат</p>
      <h2>{result.options.length ? "Вы успеваете" : "Вариантов пока нет"}</h2>
      <p>{result.options.length ? `Нашли ${result.options.length} способа добраться до ${form.destinationCity} вовремя.` : "Мы не покажем маршрут, который прибывает позже дедлайна."}</p>
      <div><span>{place?.name} → {form.destinationCity}</span><strong>до {formatTime(toIso(form.arrivalDeadline))}</strong></div>
    </div>
    {result.options.length ? <div className="minimal-options">{result.options.map((option, index) => <Option option={option} index={index} isOpening={openingId === option.id} onOpen={() => onOpenOffer(option)} key={option.id} />)}</div> : <div className="minimal-empty"><p>Попробуйте посмотреть отправления из других точек города.</p>{!form.allowOtherPlaces && <button type="button" onClick={onExpandSearch}>Искать по всему городу</button>}</div>}
    {error && <div className="minimal-error" role="alert">{error}</div>}
    <button className="start-again" type="button" onClick={onStartAgain}>Изменить поиск</button>
  </section>;
}

function Option({ option, index, isOpening, onOpen }: { option: RescueOption; index: number; isOpening: boolean; onOpen: () => void }) {
  const icon = MODE_ICONS[option.segments[0]?.mode ?? "plane"];
  const firstSegment = option.segments[0];
  const lastSegment = option.segments.at(-1);
  const durationMinutes = Math.max(0, Math.round((Date.parse(option.arrivalAt) - Date.parse(option.departureAt)) / 60_000));
  return <article className="minimal-option" style={{ animationDelay: `${index * 110}ms` }}>
    <div className="option-label"><span>{icon}</span><p>{option.category === "fastest" ? "Самый быстрый" : option.category === "cheapest" ? "Самый выгодный" : "Удобный маршрут"}</p><small>{firstSegment?.carrier}{firstSegment?.voyageNumber ? ` · ${firstSegment.voyageNumber}` : ""}</small></div>
    <div className="ticket-times"><div><strong>{formatTime(option.departureAt)}</strong><span>{firstSegment?.fromStation}</span></div><div><i>{formatDuration(durationMinutes)}</i><b>{option.transferCount === 0 ? "Прямой" : `${option.transferCount} пересадка`}</b></div><div><strong>{formatTime(option.arrivalAt)}</strong><span>{lastSegment?.toStation}</span></div></div>
    <div className="arrival-row"><div><span>Прибытие</span><strong>{formatDateTime(option.arrivalAt)}</strong></div><div><span>Запас до дедлайна</span><strong>{formatDuration(option.deadlineMarginMinutes)}</strong></div></div>
    {option.baggageDescription && <p className="baggage-copy">▣ {option.baggageDescription}</p>}
    <div className="option-bottom"><div><span>За всех пассажиров</span><strong>{formatMoney(option.totalPrice)}</strong></div><button type="button" onClick={onOpen} disabled={isOpening}>{isOpening ? "Открываем…" : "Открыть на Туту ↗"}</button></div>
  </article>;
}
