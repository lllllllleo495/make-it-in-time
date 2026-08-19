"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  CurrentJourneyStatus,
  RescueSearchRequest,
  ResultCategory,
  SearchResponse,
  TransportMode,
} from "../lib/domain";

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
    title: "Исходный рейс пока укладывается в дедлайн",
    text: "Ожидаемое прибытие не позже указанного времени. Альтернативы ниже можно использовать как запасной план.",
  },
  misses: {
    title: "Исходный рейс не укладывается в дедлайн",
    text: "Ниже — новые билеты, которые прибывают вовремя по опубликованному расписанию.",
  },
  unknown: {
    title: "Не хватает времени прибытия исходного рейса",
    text: "Мы не делаем предположений о его прибытии, но всё равно ищем альтернативы до дедлайна.",
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

const DEMO_STATE: FormState = {
  placeId: "pulkovo",
  customPlaceName: "",
  customPlaceCity: "",
  customPlaceType: "airport",
  currentTime: "2026-08-19T09:00",
  disruptionType: "delayed",
  scheduledDeparture: "2026-08-19T10:30",
  newDeparture: "2026-08-19T18:00",
  expectedArrival: "2026-08-19T19:30",
  flightNumber: "SU 15",
  airlineId: "aeroflot",
  sellerId: "tutu",
  destinationCity: "Москва",
  arrivalDeadline: "2026-08-19T18:00",
  readyFrom: "2026-08-19T09:00",
  allowOtherPlaces: true,
  passengers: 1,
  modes: ["plane", "train", "bus"],
  priority: "fastest",
  maxPrice: "",
  maxTransfers: 2,
};

function toIso(value: string) {
  return new Date(value).toISOString();
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
  return new Intl.NumberFormat("ru-RU").format(value) + " ₽";
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
      currentTime: toIso(form.currentTime),
      disruptionType: form.disruptionType,
      scheduledDeparture: toIso(form.scheduledDeparture),
      newDeparture:
        form.disruptionType === "delayed" ? toIso(form.newDeparture) : undefined,
      expectedArrival: form.expectedArrival
        ? toIso(form.expectedArrival)
        : undefined,
      flightNumber: form.flightNumber || undefined,
      airlineId: form.airlineId || undefined,
      sellerId: form.sellerId || undefined,
    },
    destination: {
      city: form.destinationCity.trim(),
      arrivalDeadline: toIso(form.arrivalDeadline),
    },
    departure: {
      readyFrom: toIso(form.readyFrom),
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
  const [form, setForm] = useState<FormState>(DEMO_STATE);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const place = useMemo(
    () => form.placeId === "custom"
      ? { name: form.customPlaceName || "Другая точка" }
      : PLACE_OPTIONS.find((option) => option.id === form.placeId),
    [form.placeId, form.customPlaceName],
  );

  function setField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleMode(mode: TransportMode) {
    setForm((current) => ({
      ...current,
      modes: current.modes.includes(mode)
        ? current.modes.filter((item) => item !== mode)
        : [...current.modes, mode],
    }));
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
      requestAnimationFrame(() => {
        document.getElementById("results")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
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
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Успеть — на главную">
          <span className="brand-mark" aria-hidden="true">У</span>
          <span>Успеть</span>
        </a>
        <div className="prototype-label">
          <span className="live-dot" aria-hidden="true" />
          MVP для Туту MCP
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">План Б после отмены или переноса</p>
          <h1>Сорвало рейс?<br /><span>Ещё можно успеть.</span></h1>
          <p className="hero-lead">
            Сообщите, где вы, когда готовы выехать и к какому времени нужно
            прибыть. Мы покажем до трёх разных билетов, которые укладываются в
            дедлайн по расписанию.
          </p>
        </div>

        <div className="hero-note" aria-label="Как работает сервис">
          <p className="note-number">≤ 3</p>
          <p className="note-title">подходящих варианта</p>
          <p className="note-text">Без дублей и заведомо опаздывающих маршрутов</p>
        </div>
      </section>

      <section className="search-section" aria-labelledby="search-title">
        <div className="section-heading">
          <div>
            <p className="step-label">Шаг 1</p>
            <h2 id="search-title">Расскажите, что произошло</h2>
          </div>
          <button className="text-button" type="button" onClick={() => {
            setForm(DEMO_STATE);
            setResult(null);
            setError(null);
          }}>
            Заполнить демо-кейс
          </button>
        </div>

        <form className="rescue-form" onSubmit={handleSubmit}>
          <fieldset className="form-card form-card-incident">
            <legend><span>01</span> Исходный рейс</legend>
            <div className="field-grid two-columns">
              <label className="field field-wide">
                <span>Где вы сейчас</span>
                <select value={form.placeId} onChange={(event) => setField("placeId", event.target.value)}>
                  {PLACE_OPTIONS.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.name}, {option.city}
                    </option>
                  ))}
                  <option value="custom">Другой аэропорт или вокзал…</option>
                </select>
                <small>Аэропорт или вокзал — не геолокация</small>
              </label>

              {form.placeId === "custom" && (
                <>
                  <label className="field">
                    <span>Название точки</span>
                    <input type="text" required placeholder="Например, аэропорт Кольцово" value={form.customPlaceName} onChange={(event) => setField("customPlaceName", event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Город отправления</span>
                    <input type="text" required placeholder="Например, Екатеринбург" value={form.customPlaceCity} onChange={(event) => setField("customPlaceCity", event.target.value)} />
                  </label>
                  <div className="field field-wide">
                    <span>Тип точки</span>
                    <div className="segmented" role="radiogroup" aria-label="Тип точки отправления">
                      <label className={form.customPlaceType === "airport" ? "active" : ""}>
                        <input type="radio" name="placeType" checked={form.customPlaceType === "airport"} onChange={() => setField("customPlaceType", "airport")} />
                        Аэропорт
                      </label>
                      <label className={form.customPlaceType === "station" ? "active" : ""}>
                        <input type="radio" name="placeType" checked={form.customPlaceType === "station"} onChange={() => setField("customPlaceType", "station")} />
                        Вокзал
                      </label>
                    </div>
                  </div>
                </>
              )}

              <label className="field">
                <span>Сейчас, местное время</span>
                <input type="datetime-local" required value={form.currentTime} onChange={(event) => setField("currentTime", event.target.value)} />
              </label>

              <label className="field">
                <span>Рейс был назначен на</span>
                <input type="datetime-local" required value={form.scheduledDeparture} onChange={(event) => setField("scheduledDeparture", event.target.value)} />
              </label>

              <div className="field field-wide">
                <span>Что случилось</span>
                <div className="segmented" role="radiogroup" aria-label="Что случилось с рейсом">
                  <label className={form.disruptionType === "delayed" ? "active" : ""}>
                    <input type="radio" name="disruption" checked={form.disruptionType === "delayed"} onChange={() => setField("disruptionType", "delayed")} />
                    Перенесли
                  </label>
                  <label className={form.disruptionType === "cancelled" ? "active" : ""}>
                    <input type="radio" name="disruption" checked={form.disruptionType === "cancelled"} onChange={() => setField("disruptionType", "cancelled")} />
                    Отменили
                  </label>
                </div>
              </div>

              {form.disruptionType === "delayed" && (
                <label className="field">
                  <span>Новое время вылета</span>
                  <input type="datetime-local" required value={form.newDeparture} onChange={(event) => setField("newDeparture", event.target.value)} />
                </label>
              )}

              <label className="field">
                <span>Ожидаемое прибытие <em>необязательно</em></span>
                <input type="datetime-local" value={form.expectedArrival} onChange={(event) => setField("expectedArrival", event.target.value)} />
              </label>

              <label className="field">
                <span>Номер рейса <em>необязательно</em></span>
                <input type="text" placeholder="Например, SU 15" value={form.flightNumber} onChange={(event) => setField("flightNumber", event.target.value)} />
              </label>

              <label className="field">
                <span>Авиакомпания</span>
                <select value={form.airlineId} onChange={(event) => setField("airlineId", event.target.value)}>
                  <option value="">Не указана</option>
                  <option value="aeroflot">Аэрофлот</option>
                </select>
              </label>

              <label className="field">
                <span>Где куплен билет</span>
                <select value={form.sellerId} onChange={(event) => setField("sellerId", event.target.value)}>
                  <option value="">Не указано</option>
                  <option value="tutu">Туту</option>
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="form-card form-card-goal">
            <legend><span>02</span> Цель поездки</legend>
            <div className="field-grid">
              <label className="field field-wide">
                <span>Куда нужно попасть</span>
                <input list="cities" type="text" required placeholder="Город" value={form.destinationCity} onChange={(event) => setField("destinationCity", event.target.value)} />
                <datalist id="cities">
                  <option value="Москва" />
                  <option value="Санкт-Петербург" />
                  <option value="Сочи" />
                  <option value="Казань" />
                </datalist>
              </label>

              <label className="field field-emphasis field-wide">
                <span>Быть в городе не позже</span>
                <input type="datetime-local" required value={form.arrivalDeadline} onChange={(event) => setField("arrivalDeadline", event.target.value)} />
                <small>Считаем прибытие на вокзал или в аэропорт города</small>
              </label>

              <label className="field field-wide">
                <span>Готов отправляться не раньше</span>
                <input type="datetime-local" required value={form.readyFrom} onChange={(event) => setField("readyFrom", event.target.value)} />
              </label>

              <div className="switch-row field-wide">
                <input id="allow-other-places" type="checkbox" checked={form.allowOtherPlaces} onChange={(event) => setField("allowOtherPlaces", event.target.checked)} />
                <span className="switch" aria-hidden="true" />
                <label htmlFor="allow-other-places">
                  <strong>Искать из других вокзалов и аэропортов города</strong>
                  <small>Время дороги до них не включаем</small>
                </label>
              </div>
            </div>
          </fieldset>

          <fieldset className="form-card form-card-filters">
            <legend><span>03</span> Дополнительные параметры</legend>
            <div className="field-grid two-columns">
              <div className="field field-wide">
                <span>Виды транспорта</span>
                <div className="chip-group">
                  {(Object.keys(MODE_LABELS) as TransportMode[]).map((mode) => (
                    <label className={form.modes.includes(mode) ? "chip active" : "chip"} key={mode}>
                      <input type="checkbox" checked={form.modes.includes(mode)} onChange={() => toggleMode(mode)} />
                      {MODE_LABELS[mode]}
                    </label>
                  ))}
                </div>
              </div>

              <label className="field">
                <span>Пассажиров</span>
                <input type="number" min="1" max="9" required value={form.passengers} onChange={(event) => setField("passengers", Number(event.target.value))} />
              </label>

              <label className="field">
                <span>Максимум пересадок</span>
                <select value={form.maxTransfers} onChange={(event) => setField("maxTransfers", Number(event.target.value))}>
                  <option value={0}>Без пересадок</option>
                  <option value={1}>1 пересадка</option>
                  <option value={2}>До 2 пересадок</option>
                  <option value={3}>До 3 пересадок</option>
                </select>
              </label>

              <label className="field">
                <span>Бюджет до <em>необязательно</em></span>
                <div className="input-suffix">
                  <input type="number" min="1" placeholder="Без ограничения" value={form.maxPrice} onChange={(event) => setField("maxPrice", event.target.value)} />
                  <span>₽</span>
                </div>
              </label>

              <label className="field">
                <span>Что важнее</span>
                <select value={form.priority} onChange={(event) => setField("priority", event.target.value as ResultCategory)}>
                  <option value="fastest">Приехать раньше</option>
                  <option value="cheapest">Потратить меньше</option>
                  <option value="fewest_transfers">Меньше пересадок</option>
                </select>
              </label>
            </div>
          </fieldset>

          <div className="submit-panel">
            <div>
              <p>{place?.name} → {form.destinationCity || "город назначения"}</p>
              <span>Сначала проверим обязательные поля, затем запросим билеты</span>
            </div>
            <button className="primary-button" type="submit" disabled={isLoading}>
              {isLoading ? <><span className="spinner" aria-hidden="true" /> Ищем варианты</> : <>Найти, как успеть <span aria-hidden="true">→</span></>}
            </button>
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}
        </form>
      </section>

      <section className="scope-strip" aria-label="Границы расчёта">
        <p><strong>Что учитываем:</strong> готовность к отправлению, прибытие до дедлайна, цену, транспорт и пересадки.</p>
        <p><strong>Пока не учитываем:</strong> дорогу до точки отправления, регистрацию, досмотр, багаж и дорогу по городу назначения.</p>
      </section>

      {result && <Results response={result} destination={form.destinationCity} />}

      <footer>
        <a className="brand footer-brand" href="#top"><span className="brand-mark">У</span><span>Успеть</span></a>
        <p>Экстренный поиск билетов после срыва рейса · MVP для ИИ-хакатона Туту</p>
      </footer>
    </main>
  );
}

function Results({ response, destination }: { response: SearchResponse; destination: string }) {
  const journeyCopy = JOURNEY_COPY[response.currentJourneyStatus];

  return (
    <section className="results-section" id="results" aria-live="polite">
      <div className="section-heading results-heading">
        <div>
          <p className="step-label">Шаг 2</p>
          <h2>Варианты, чтобы успеть</h2>
        </div>
        <div className="data-badge">
          {response.dataSource === "tutu-mcp" ? "Данные Туту MCP" : "Демо-данные"}
        </div>
      </div>

      <div className={`journey-status status-${response.currentJourneyStatus}`}>
        <span className="status-symbol" aria-hidden="true">
          {response.currentJourneyStatus === "fits" ? "✓" : response.currentJourneyStatus === "unknown" ? "?" : "!"}
        </span>
        <div><strong>{journeyCopy.title}</strong><p>{journeyCopy.text}</p></div>
      </div>

      {response.options.length ? (
        <>
          <div className="results-summary">
            <p><strong>{response.options.length}</strong> {response.options.length === 1 ? "вариант" : "варианта"} прибывают в {destination} вовремя по расписанию</p>
            <span>Ещё {response.rejectedCount} не прошли ограничения</span>
          </div>
          <div className="options-grid">
            {response.options.map((option, index) => (
              <article className="option-card" key={option.id}>
                <div className="option-topline">
                  <span className="option-number">0{index + 1}</span>
                  <span className={`category category-${option.category}`}>{CATEGORY_LABELS[option.category]}</span>
                </div>
                <h3>{option.title}</h3>
                <p className="mode-line">{option.segments.map((segment) => MODE_LABELS[segment.mode]).join(" + ")} · {option.transferCount === 0 ? "без пересадок" : `${option.transferCount} перес.`}</p>

                <div className="route-times">
                  <div><time>{formatDateTime(option.departureAt)}</time><span>{option.segments[0]?.fromStation}</span></div>
                  <div className="route-line" aria-hidden="true"><span /></div>
                  <div><time>{formatDateTime(option.arrivalAt)}</time><span>{option.segments.at(-1)?.toStation}</span></div>
                </div>

                <div className="margin-box">
                  <span aria-hidden="true">✓</span>
                  Запас до дедлайна: <strong>{formatDuration(option.deadlineMarginMinutes)}</strong>
                </div>

                <div className="option-meta">
                  <div><span>Цена за всех</span><strong>{formatMoney(option.totalPrice)}</strong></div>
                  {option.seatsLeft && <div><span>Осталось мест</span><strong>{option.seatsLeft}</strong></div>}
                </div>

                <a className="booking-button" href={option.bookingUrl} target="_blank" rel="noreferrer">
                  Перейти к билету <span aria-hidden="true">↗</span>
                </a>
              </article>
            ))}
          </div>
          <p className="schedule-warning">Время и наличие мест нужно повторно проверить перед покупкой. «Успеть» сравнивает опубликованное расписание и не гарантирует фактическое прибытие.</p>
        </>
      ) : (
        <div className="empty-state">
          <span aria-hidden="true">×</span>
          <h3>До этого дедлайна вариантов не найдено</h3>
          <p>Мы не будем показывать билет, с которым вы опоздаете. Попробуйте перенести дедлайн, выбрать следующий день или снять часть ограничений.</p>
          <a href="#search-title">Изменить параметры</a>
        </div>
      )}

      <Support response={response} />
    </section>
  );
}

function Support({ response }: { response: SearchResponse }) {
  return (
    <section className="support-section" aria-labelledby="support-title">
      <div className="support-intro">
        <p className="step-label">Параллельно</p>
        <h2 id="support-title">Разберитесь с исходным билетом</h2>
        <p>Проверенные контакты и спокойный план первых действий. Без догадок о компенсациях и юридических обещаний.</p>
      </div>

      <div className="support-content">
        {response.support.contacts.length > 0 && (
          <div className="contact-list">
            {response.support.contacts.map((contact) => (
              <article className="contact-card" key={contact.id}>
                <div>
                  <span className="contact-type">{CONTACT_LABELS[contact.type]}</span>
                  <h3>{contact.name}</h3>
                  <p>{contact.description}</p>
                </div>
                {contact.phone && <a className="phone" href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}>{contact.phone}</a>}
                <div className="contact-links">
                  {contact.supportUrl && <a href={contact.supportUrl} target="_blank" rel="noreferrer">Помощь ↗</a>}
                  <a href={contact.sourceUrl} target="_blank" rel="noreferrer">Официальный источник ↗</a>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="action-plan">
          <h3>Что сделать сейчас</h3>
          <ol>
            {response.support.actionPlan.map((item, index) => (
              <li key={item}><span>{index + 1}</span><p>{item}</p></li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
