"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  CurrentJourneyStatus,
  RescueSearchRequest,
  ResultCategory,
  SearchResponse,
  TransportMode,
} from "../lib/domain";

type Screen = "start" | "details" | "results" | "support";
type PlaceOption = RescueSearchRequest["incident"]["currentPlace"];

const PLACE_OPTIONS: PlaceOption[] = [
  { id: "pulkovo", name: "Пулково", city: "Санкт-Петербург", type: "airport" },
  { id: "sochi-airport", name: "Аэропорт Сочи", city: "Сочи", type: "airport" },
  { id: "sheremetyevo", name: "Шереметьево", city: "Москва", type: "airport" },
  { id: "moskovsky-station", name: "Московский вокзал", city: "Санкт-Петербург", type: "station" },
];

const MODE_LABELS: Record<TransportMode, string> = {
  plane: "Самолёт",
  train: "Поезд",
  bus: "Автобус",
  suburban: "Электричка",
};

const CATEGORY_LABELS: Record<ResultCategory, string> = {
  fastest: "Самый быстрый",
  cheapest: "Самый выгодный",
  fewest_transfers: "Меньше пересадок",
};

const CONTACT_LABELS = {
  airline: "Авиакомпания",
  airport: "Аэропорт",
  seller: "Продавец билета",
};

const JOURNEY_COPY: Record<CurrentJourneyStatus, { title: string; text: string }> = {
  fits: {
    title: "Исходный рейс пока успевает",
    text: "По указанному времени прибытия он укладывается в дедлайн. Варианты ниже можно оставить как запасной план.",
  },
  misses: {
    title: "Исходный рейс уже не успевает",
    text: "Показываем только новые билеты, которые прибывают до вашего дедлайна по расписанию.",
  },
  unknown: {
    title: "Прибытие исходного рейса неизвестно",
    text: "Не строим догадок о его прибытии и отдельно ищем альтернативные билеты.",
  },
  cancelled: {
    title: "Исходный рейс отменён",
    text: "Ищем новый билет независимо от исходного рейса.",
  },
};

type FormState = {
  placeId: string;
  customPlaceName: string;
  customPlaceCity: string;
  customPlaceType: "airport" | "station";
  currentTime: string;
  disruptionType: "cancelled" | "delayed";
  scheduledDeparture: string;
  newDeparture: string;
  expectedArrival: string;
  flightNumber: string;
  airlineId: string;
  sellerId: string;
  destinationCity: string;
  arrivalDeadline: string;
  readyFrom: string;
  allowOtherPlaces: boolean;
  passengers: number;
  modes: TransportMode[];
  priority: ResultCategory;
  maxPrice: string;
  maxTransfers: number;
};

const EMPTY_FORM: FormState = {
  placeId: "",
  customPlaceName: "",
  customPlaceCity: "",
  customPlaceType: "airport",
  currentTime: "",
  disruptionType: "delayed",
  scheduledDeparture: "",
  newDeparture: "",
  expectedArrival: "",
  flightNumber: "",
  airlineId: "",
  sellerId: "",
  destinationCity: "",
  arrivalDeadline: "",
  readyFrom: "",
  allowOtherPlaces: true,
  passengers: 1,
  modes: ["plane", "train", "bus"],
  priority: "fastest",
  maxPrice: "",
  maxTransfers: 2,
};

function toIso(value: string, label: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new Error(`Проверьте поле «${label}»`);
  }
  return date.toISOString();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} мин`;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

function buildRequest(form: FormState): RescueSearchRequest {
  const place = form.placeId === "custom"
    ? {
        id: `custom-${form.customPlaceType}`,
        name: form.customPlaceName.trim(),
        city: form.customPlaceCity.trim(),
        type: form.customPlaceType,
      }
    : PLACE_OPTIONS.find((option) => option.id === form.placeId);

  if (!place) throw new Error("Выберите аэропорт или вокзал");

  return {
    incident: {
      currentPlace: place,
      currentTime: toIso(form.currentTime, "Сейчас"),
      disruptionType: form.disruptionType,
      scheduledDeparture: toIso(form.scheduledDeparture, "Вылет был на"),
      newDeparture:
        form.disruptionType === "delayed" ? toIso(form.newDeparture, "Новый вылет") : undefined,
      expectedArrival: form.expectedArrival ? toIso(form.expectedArrival, "Прибытие рейса") : undefined,
      flightNumber: form.flightNumber || undefined,
      airlineId: form.airlineId || undefined,
      sellerId: form.sellerId || undefined,
    },
    destination: {
      city: form.destinationCity.trim(),
      arrivalDeadline: toIso(form.arrivalDeadline, "Быть в городе не позже"),
    },
    departure: {
      readyFrom: toIso(form.readyFrom, "Готов отправляться не раньше"),
      allowOtherPlaces: form.allowOtherPlaces,
    },
    preferences: {
      passengers: form.passengers,
      modes: form.modes,
      priority: form.priority,
      maxPrice: form.maxPrice ? Number(form.maxPrice) : undefined,
      maxTransfers: form.maxTransfers,
    },
  };
}

export function RescueApp() {
  const [screen, setScreen] = useState<Screen>("start");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const place = useMemo(() => {
    if (form.placeId === "custom") {
      return { name: form.customPlaceName || "Другая точка" };
    }
    return PLACE_OPTIONS.find((option) => option.id === form.placeId);
  }, [form.placeId, form.customPlaceName]);

  function setField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setResult(null);
    setError(null);
  }

  function toggleMode(mode: TransportMode) {
    setForm((current) => ({
      ...current,
      modes: current.modes.includes(mode)
        ? current.modes.filter((item) => item !== mode)
        : [...current.modes, mode],
    }));
    setResult(null);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.modes.length) {
      setError("Выберите хотя бы один вид транспорта.");
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildRequest(form)),
      });
      const payload = await response.json();

      if (!response.ok) {
        const detail = payload.issues?.[0]?.message;
        throw new Error(detail || payload.error || "Не удалось выполнить поиск");
      }

      setResult(payload as SearchResponse);
      setScreen("results");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Что-то пошло не так. Попробуйте ещё раз.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={`app-shell screen-${screen}`}>
      <AppHeader screen={screen} hasResult={Boolean(result)} onNavigate={setScreen} />

      {screen === "start" && <StartScreen onStart={() => setScreen("details")} />}

      {screen === "details" && (
        <DetailsScreen
          form={form}
          placeName={place?.name}
          error={error}
          isLoading={isLoading}
          onField={setField}
          onToggleMode={toggleMode}
          onSubmit={handleSubmit}
        />
      )}

      {screen === "results" && result && (
        <ResultsScreen
          response={result}
          form={form}
          placeName={place?.name}
          onEdit={() => setScreen("details")}
          onSupport={() => setScreen("support")}
        />
      )}

      {screen === "support" && result && (
        <SupportScreen
          response={result}
          form={form}
          placeName={place?.name}
          onBack={() => setScreen("results")}
        />
      )}
    </div>
  );
}

function AppHeader({
  screen,
  hasResult,
  onNavigate,
}: {
  screen: Screen;
  hasResult: boolean;
  onNavigate: (screen: Screen) => void;
}) {
  const steps: Array<{ id: Screen; number: string; label: string }> = [
    { id: "start", number: "1", label: "О сервисе" },
    { id: "details", number: "2", label: "Данные" },
    { id: "results", number: "3", label: "Варианты" },
    { id: "support", number: "4", label: "Поддержка" },
  ];

  return (
    <header className="app-header">
      <button className="brand" type="button" onClick={() => onNavigate("start")} aria-label="Успеть — на главную">
        <span className="brand-mark" aria-hidden="true">У</span>
        <span>Успеть</span>
      </button>

      <nav className="step-nav" aria-label="Этапы поиска">
        {steps.map((step) => {
          const locked = (step.id === "results" || step.id === "support") && !hasResult;
          return (
            <button
              type="button"
              key={step.id}
              className={screen === step.id ? "active" : ""}
              disabled={locked}
              onClick={() => onNavigate(step.id)}
            >
              <span>{step.number}</span>
              {step.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="start-screen">
      <div className="start-content">
        <p className="eyebrow">Когда исходный план больше не работает</p>
        <h1>Успеть — значит<br />быстро найти <span>план Б</span></h1>
        <p className="start-lead">
          Сравним самолёты, поезда и автобусы. Оставим только варианты,
          которые по расписанию доставят вас в город до нужного времени.
        </p>
        <div className="start-actions">
          <button className="orange-button hero-button" type="button" onClick={onStart}>
            Найти маршрут <span aria-hidden="true">→</span>
          </button>
          <p><strong>До 3 вариантов</strong><span>без дублей и опозданий</span></p>
        </div>
      </div>

      <div className="route-visual" aria-hidden="true">
        <div className="route-origin"><span>Вы здесь</span></div>
        <div className="route-path route-plane"><i>✈</i></div>
        <div className="route-path route-train"><i>◆</i></div>
        <div className="route-path route-bus"><i>●</i></div>
        <div className="route-destination"><span>Успеть к сроку</span></div>
      </div>

      <div className="benefit-row">
        <article><span>01</span><strong>Дедлайн важнее</strong><p>Сразу исключаем всё, что прибывает слишком поздно.</p></article>
        <article><span>02</span><strong>Весь транспорт</strong><p>Сравниваем разные способы добраться в одном поиске.</p></article>
        <article><span>03</span><strong>Помощь рядом</strong><p>Собираем контакты и первые действия по исходному билету.</p></article>
      </div>
    </main>
  );
}

type DetailsProps = {
  form: FormState;
  placeName?: string;
  error: string | null;
  isLoading: boolean;
  onField: <Key extends keyof FormState>(key: Key, value: FormState[Key]) => void;
  onToggleMode: (mode: TransportMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function DetailsScreen({
  form,
  placeName,
  error,
  isLoading,
  onField,
  onToggleMode,
  onSubmit,
}: DetailsProps) {
  return (
    <main className="details-screen">
      <div className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Шаг 2 из 4</p>
          <h1>Что произошло и куда нужно успеть?</h1>
        </div>
        <p>Все поля со звёздочкой обязательны. Указывайте местное время.</p>
      </div>

      <form className="compact-form" onSubmit={onSubmit}>
        <div className="form-toolbar">
          <div>
            <span>Маршрут</span>
            <strong>{placeName || "Откуда"} <i>→</i> {form.destinationCity || "Куда"}</strong>
          </div>
          <button className="orange-button search-button" type="submit" disabled={isLoading}>
            {isLoading ? <><span className="spinner" aria-hidden="true" /> Ищем</> : <>Найти варианты <span aria-hidden="true">→</span></>}
          </button>
        </div>

        <div className="form-columns">
          <section className="form-section incident-section" aria-labelledby="incident-heading">
            <div className="form-section-title">
              <span>01</span><div><h2 id="incident-heading">Исходный рейс</h2><p>Где вы и что изменилось</p></div>
            </div>

            <label className="field">
              <span>Где вы сейчас *</span>
              <select required value={form.placeId} onChange={(event) => onField("placeId", event.target.value)}>
                <option value="" disabled>Аэропорт или вокзал</option>
                {PLACE_OPTIONS.map((option) => (
                  <option value={option.id} key={option.id}>{option.name}, {option.city}</option>
                ))}
                <option value="custom">Другая точка…</option>
              </select>
            </label>

            {form.placeId === "custom" && (
              <div className="inline-fields">
                <label className="field"><span>Название *</span><input required type="text" value={form.customPlaceName} onChange={(event) => onField("customPlaceName", event.target.value)} /></label>
                <label className="field"><span>Город *</span><input required type="text" value={form.customPlaceCity} onChange={(event) => onField("customPlaceCity", event.target.value)} /></label>
              </div>
            )}

            <div className="inline-fields">
              <label className="field"><span>Сейчас *</span><input required type="datetime-local" value={form.currentTime} onInput={(event) => onField("currentTime", event.currentTarget.value)} /></label>
              <label className="field"><span>Вылет был на *</span><input required type="datetime-local" value={form.scheduledDeparture} onInput={(event) => onField("scheduledDeparture", event.currentTarget.value)} /></label>
            </div>

            <div className="field">
              <span>Что случилось *</span>
              <div className="segmented" role="radiogroup" aria-label="Что случилось с рейсом">
                <label className={form.disruptionType === "delayed" ? "active" : ""}><input type="radio" name="disruption" checked={form.disruptionType === "delayed"} onChange={() => onField("disruptionType", "delayed")} />Перенесли</label>
                <label className={form.disruptionType === "cancelled" ? "active" : ""}><input type="radio" name="disruption" checked={form.disruptionType === "cancelled"} onChange={() => onField("disruptionType", "cancelled")} />Отменили</label>
              </div>
            </div>

            <div className="inline-fields">
              {form.disruptionType === "delayed" && (
                <label className="field"><span>Новый вылет *</span><input required type="datetime-local" value={form.newDeparture} onInput={(event) => onField("newDeparture", event.currentTarget.value)} /></label>
              )}
              <label className="field"><span>Прибытие рейса</span><input type="datetime-local" value={form.expectedArrival} onInput={(event) => onField("expectedArrival", event.currentTarget.value)} /></label>
            </div>
          </section>

          <section className="form-section goal-section" aria-labelledby="goal-heading">
            <div className="form-section-title">
              <span>02</span><div><h2 id="goal-heading">Куда нужно успеть</h2><p>Город, дедлайн и готовность</p></div>
            </div>

            <label className="field">
              <span>Город назначения *</span>
              <input required list="cities" type="text" placeholder="Например, Москва" value={form.destinationCity} onChange={(event) => onField("destinationCity", event.target.value)} />
              <datalist id="cities"><option value="Москва" /><option value="Санкт-Петербург" /><option value="Сочи" /><option value="Казань" /></datalist>
            </label>

            <label className="field deadline-field">
              <span>Быть в городе не позже *</span>
              <input required type="datetime-local" value={form.arrivalDeadline} onInput={(event) => onField("arrivalDeadline", event.currentTarget.value)} />
            </label>

            <label className="field">
              <span>Готов отправляться не раньше *</span>
              <input required type="datetime-local" value={form.readyFrom} onInput={(event) => onField("readyFrom", event.currentTarget.value)} />
            </label>

            <div className="switch-row">
              <input id="allow-other-places" type="checkbox" checked={form.allowOtherPlaces} onChange={(event) => onField("allowOtherPlaces", event.target.checked)} />
              <span className="switch" aria-hidden="true" />
              <label htmlFor="allow-other-places"><strong>Другие точки города</strong><small>Показывать билеты из соседних вокзалов и аэропортов</small></label>
            </div>

            <div className="calculation-note"><span aria-hidden="true">i</span><p>Проверяем прибытие до дедлайна. Дорогу до точки отправления пока не рассчитываем.</p></div>
          </section>

          <section className="form-section preferences-section" aria-labelledby="preferences-heading">
            <div className="form-section-title">
              <span>03</span><div><h2 id="preferences-heading">Параметры поиска</h2><p>Транспорт, цена и поддержка</p></div>
            </div>

            <div className="field">
              <span>Виды транспорта *</span>
              <div className="chip-group">
                {(Object.keys(MODE_LABELS) as TransportMode[]).map((mode) => (
                  <label className={form.modes.includes(mode) ? "chip active" : "chip"} key={mode}>
                    <input type="checkbox" checked={form.modes.includes(mode)} onChange={() => onToggleMode(mode)} />
                    {MODE_LABELS[mode]}
                  </label>
                ))}
              </div>
            </div>

            <div className="inline-fields">
              <label className="field"><span>Пассажиров</span><input type="number" min="1" max="9" required value={form.passengers} onChange={(event) => onField("passengers", Number(event.target.value))} /></label>
              <label className="field"><span>Пересадок</span><select value={form.maxTransfers} onChange={(event) => onField("maxTransfers", Number(event.target.value))}><option value={0}>Без пересадок</option><option value={1}>До 1</option><option value={2}>До 2</option><option value={3}>До 3</option></select></label>
            </div>

            <div className="inline-fields">
              <label className="field"><span>Бюджет до</span><div className="input-suffix"><input type="number" min="1" placeholder="Любой" value={form.maxPrice} onChange={(event) => onField("maxPrice", event.target.value)} /><b>₽</b></div></label>
              <label className="field"><span>Что важнее</span><select value={form.priority} onChange={(event) => onField("priority", event.target.value as ResultCategory)}><option value="fastest">Приехать раньше</option><option value="cheapest">Потратить меньше</option><option value="fewest_transfers">Меньше пересадок</option></select></label>
            </div>

            <div className="inline-fields">
              <label className="field"><span>Номер рейса</span><input type="text" placeholder="SU 15" value={form.flightNumber} onChange={(event) => onField("flightNumber", event.target.value)} /></label>
              <label className="field"><span>Авиакомпания</span><select value={form.airlineId} onChange={(event) => onField("airlineId", event.target.value)}><option value="">Не указана</option><option value="aeroflot">Аэрофлот</option></select></label>
            </div>

            <label className="field"><span>Где куплен билет</span><select value={form.sellerId} onChange={(event) => onField("sellerId", event.target.value)}><option value="">Не указано</option><option value="tutu">Туту</option></select></label>
          </section>
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}
      </form>
    </main>
  );
}

function ResultsScreen({
  response,
  form,
  placeName,
  onEdit,
  onSupport,
}: {
  response: SearchResponse;
  form: FormState;
  placeName?: string;
  onEdit: () => void;
  onSupport: () => void;
}) {
  const journeyCopy = JOURNEY_COPY[response.currentJourneyStatus];

  return (
    <main className="results-screen">
      <div className="search-summary-bar">
        <div><span>Откуда</span><strong>{placeName}</strong></div>
        <div><span>Куда</span><strong>{form.destinationCity}</strong></div>
        <div><span>Дедлайн</span><strong>{formatDateTime(form.arrivalDeadline)}</strong></div>
        <div><span>Пассажиры</span><strong>{form.passengers}</strong></div>
        <button type="button" onClick={onEdit}>Изменить поиск</button>
      </div>

      <div className="results-content">
        <div className="results-title-row">
          <div><p className="eyebrow">Шаг 3 из 4</p><h1>{response.options.length ? "Нашли, как успеть" : "Не нашли маршрут до дедлайна"}</h1></div>
          <span className="found-count">{response.options.length} из {response.options.length + response.rejectedCount} подходят</span>
        </div>

        <div className={`journey-status status-${response.currentJourneyStatus}`}>
          <span className="status-symbol" aria-hidden="true">{response.currentJourneyStatus === "fits" ? "✓" : response.currentJourneyStatus === "unknown" ? "?" : "!"}</span>
          <div><strong>{journeyCopy.title}</strong><p>{journeyCopy.text}</p></div>
        </div>

        {response.options.length ? (
          <div className="result-list">
            {response.options.map((option) => (
              <article className="result-card" key={option.id}>
                <div className="result-label"><span>{CATEGORY_LABELS[option.category]}</span><p>{option.segments.map((segment) => MODE_LABELS[segment.mode]).join(" + ")}</p></div>
                <div className="result-route">
                  <div><time>{formatDateTime(option.departureAt)}</time><span>{option.segments[0]?.fromStation}</span></div>
                  <div className="result-line"><small>{option.transferCount === 0 ? "Прямой" : `${option.transferCount} перес.`}</small><i /></div>
                  <div><time>{formatDateTime(option.arrivalAt)}</time><span>{option.segments.at(-1)?.toStation}</span></div>
                </div>
                <div className="result-margin"><span>Запас</span><strong>{formatDuration(option.deadlineMarginMinutes)}</strong></div>
                <div className="result-price"><span>за всех</span><strong>{formatMoney(option.totalPrice)}</strong>{option.seatsLeft && <small>Осталось мест: {option.seatsLeft}</small>}</div>
                <a className="orange-button ticket-button" href={option.bookingUrl} target="_blank" rel="noreferrer">К билету</a>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span aria-hidden="true">×</span>
            <h2>До этого времени подходящих билетов нет</h2>
            <p>Попробуйте изменить дедлайн, транспорт или допустимое число пересадок. Мы не показываем варианты, с которыми вы опоздаете.</p>
            <button type="button" onClick={onEdit}>Изменить параметры</button>
          </div>
        )}

        <div className="support-prompt">
          <div><span aria-hidden="true">?</span><p><strong>Что делать с исходным билетом?</strong>Контакты и первые действия уже собраны по вашим данным.</p></div>
          <button type="button" onClick={onSupport}>Открыть поддержку <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </main>
  );
}

function SupportScreen({
  response,
  form,
  placeName,
  onBack,
}: {
  response: SearchResponse;
  form: FormState;
  placeName?: string;
  onBack: () => void;
}) {
  return (
    <main className="support-screen">
      <div className="page-heading support-heading">
        <div><p className="eyebrow">Шаг 4 из 4</p><h1>Помощь по исходному билету</h1><p>Собрали контакты и порядок действий по тем данным, которые вы указали.</p></div>
        <button className="secondary-button" type="button" onClick={onBack}>← Вернуться к вариантам</button>
      </div>

      <div className="support-summary">
        <div><span>Вы сейчас</span><strong>{placeName}</strong></div>
        <div><span>Направление</span><strong>{form.destinationCity}</strong></div>
        <div><span>Ситуация</span><strong>{form.disruptionType === "cancelled" ? "Рейс отменён" : "Рейс перенесён"}</strong></div>
        {form.flightNumber && <div><span>Рейс</span><strong>{form.flightNumber}</strong></div>}
      </div>

      <div className="support-layout">
        <section className="contacts-panel" aria-labelledby="contacts-title">
          <div className="panel-title"><span>01</span><div><h2 id="contacts-title">Кому обратиться</h2><p>Контакты для вашей ситуации</p></div></div>
          {response.support.contacts.length ? (
            <div className="contact-list">
              {response.support.contacts.map((contact) => (
                <article className="contact-card" key={contact.id}>
                  <div><span className="contact-type">{CONTACT_LABELS[contact.type]}</span><h3>{contact.name}</h3><p>{contact.description}</p></div>
                  {contact.phone && <a className="phone" href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}>{contact.phone}</a>}
                  <div className="contact-links">
                    {contact.supportUrl && <a href={contact.supportUrl} target="_blank" rel="noreferrer">Открыть помощь ↗</a>}
                    <a href={contact.sourceUrl} target="_blank" rel="noreferrer">Источник ↗</a>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="no-contacts"><p>Для выбранных организаций пока нет сохранённых контактов.</p><span>Проверьте сайт перевозчика, табло и стойку информации в аэропорту.</span></div>
          )}
        </section>

        <section className="action-panel" aria-labelledby="actions-title">
          <div className="panel-title"><span>02</span><div><h2 id="actions-title">Что сделать сейчас</h2><p>Коротко и по порядку</p></div></div>
          <ol>
            {response.support.actionPlan.map((item, index) => (
              <li key={item}><span>{index + 1}</span><p>{item}</p></li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
