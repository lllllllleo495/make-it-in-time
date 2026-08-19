"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  CurrentJourneyStatus,
  RescueOption,
  RescueSearchRequest,
  ResultCategory,
  SearchResponse,
  TransportMode,
} from "../lib/domain";

type Screen = "search" | "results" | "support";
type PlaceOption = RescueSearchRequest["incident"]["currentPlace"];
type FieldErrors = Partial<Record<keyof FormState, string>>;

const PLACE_OPTIONS: PlaceOption[] = [
  { id: "pulkovo", name: "Пулково", city: "Санкт-Петербург", type: "airport" },
  { id: "sochi-airport", name: "Аэропорт Сочи", city: "Сочи", type: "airport" },
  { id: "sheremetyevo", name: "Шереметьево", city: "Москва", type: "airport" },
  { id: "moskovsky-station", name: "Московский вокзал", city: "Санкт-Петербург", type: "station" },
];

const ALL_MODES: TransportMode[] = ["plane", "train", "bus", "suburban"];

const MODE_LABELS: Record<TransportMode, string> = {
  plane: "Самолёт",
  train: "Поезд",
  bus: "Автобус",
  suburban: "Электричка",
};

const CATEGORY_LABELS: Record<ResultCategory, string> = {
  fastest: "Больше всего запаса",
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
    text: "По указанному времени прибытия он укладывается в ваш дедлайн.",
  },
  misses: {
    title: "С исходным рейсом вы не успеваете",
    text: "Ниже показываем только новые варианты, которые прибывают вовремя.",
  },
  unknown: {
    title: "Для исходного рейса не хватает времени прибытия",
    text: "Не делаем предположений и отдельно ищем другой способ добраться.",
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
  destinationCity: string;
  arrivalDeadline: string;
  readyMode: "now" | "custom";
  readyFrom: string;
  disruptionType: "cancelled" | "delayed";
  scheduledDeparture: string;
  newDeparture: string;
  expectedArrival: string;
  flightNumber: string;
  airlineId: string;
  sellerId: string;
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
  destinationCity: "",
  arrivalDeadline: "",
  readyMode: "now",
  readyFrom: "",
  disruptionType: "delayed",
  scheduledDeparture: "",
  newDeparture: "",
  expectedArrival: "",
  flightNumber: "",
  airlineId: "",
  sellerId: "",
  allowOtherPlaces: true,
  passengers: 1,
  modes: ALL_MODES,
  priority: "fastest",
  maxPrice: "",
  maxTransfers: 3,
};

const DEFAULT_PREFERENCES = {
  allowOtherPlaces: true,
  passengers: 1,
  modes: ALL_MODES,
  priority: "fastest" as ResultCategory,
  maxPrice: "",
  maxTransfers: 3,
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatInputTime(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", {
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

function getPlace(form: FormState): PlaceOption | undefined {
  if (form.placeId === "custom") {
    if (!form.customPlaceName.trim() || !form.customPlaceCity.trim()) return undefined;
    return {
      id: `custom-${form.customPlaceType}`,
      name: form.customPlaceName.trim(),
      city: form.customPlaceCity.trim(),
      type: form.customPlaceType,
    };
  }
  return PLACE_OPTIONS.find((option) => option.id === form.placeId);
}

function validateForm(form: FormState) {
  const errors: FieldErrors = {};
  const place = getPlace(form);

  if (!form.placeId) errors.placeId = "Выберите аэропорт или вокзал";
  if (form.placeId === "custom" && !form.customPlaceName.trim()) {
    errors.customPlaceName = "Укажите название точки отправления";
  }
  if (form.placeId === "custom" && !form.customPlaceCity.trim()) {
    errors.customPlaceCity = "Укажите город";
  }
  if (!form.destinationCity.trim()) {
    errors.destinationCity = "Укажите город, куда нужно попасть";
  }

  const deadline = Date.parse(form.arrivalDeadline);
  if (!form.arrivalDeadline || Number.isNaN(deadline)) {
    errors.arrivalDeadline = "Укажите дату и время, к которому нужно успеть";
  }

  const readyFrom = form.readyMode === "now" ? Date.now() : Date.parse(form.readyFrom);
  if (form.readyMode === "custom" && (!form.readyFrom || Number.isNaN(readyFrom))) {
    errors.readyFrom = "Укажите, когда вы сможете отправиться";
  }
  if (
    form.readyMode === "custom" &&
    !errors.readyFrom &&
    readyFrom < Date.now() - 60_000
  ) {
    errors.readyFrom = "Это время уже прошло — выберите более позднее";
  }
  if (!errors.arrivalDeadline && !errors.readyFrom && deadline <= readyFrom) {
    errors.arrivalDeadline = "Дедлайн должен быть позже времени отправления";
  }

  if (form.scheduledDeparture && form.newDeparture) {
    if (Date.parse(form.newDeparture) < Date.parse(form.scheduledDeparture)) {
      errors.newDeparture = "Новое время не может быть раньше исходного";
    }
  }
  if (form.newDeparture && !form.scheduledDeparture) {
    errors.scheduledDeparture = "Добавьте исходное время рейса для сравнения";
  }
  if (form.expectedArrival && form.newDeparture) {
    if (Date.parse(form.expectedArrival) < Date.parse(form.newDeparture)) {
      errors.expectedArrival = "Прибытие должно быть позже нового отправления";
    }
  }

  return { errors, place };
}

function buildRequest(form: FormState, place: PlaceOption): RescueSearchRequest {
  const currentTime = new Date().toISOString();
  const readyFrom = form.readyMode === "now"
    ? currentTime
    : toIso(form.readyFrom, "Когда готовы отправиться");

  return {
    incident: {
      currentPlace: place,
      currentTime,
      disruptionType: form.disruptionType,
      scheduledDeparture: form.scheduledDeparture
        ? toIso(form.scheduledDeparture, "Исходное время рейса")
        : undefined,
      newDeparture: form.newDeparture
        ? toIso(form.newDeparture, "Новое время рейса")
        : undefined,
      expectedArrival: form.expectedArrival
        ? toIso(form.expectedArrival, "Ожидаемое прибытие")
        : undefined,
      flightNumber: form.flightNumber.trim() || undefined,
      airlineId: form.airlineId || undefined,
      sellerId: form.sellerId || undefined,
    },
    destination: {
      city: form.destinationCity.trim(),
      arrivalDeadline: toIso(form.arrivalDeadline, "Дедлайн"),
    },
    departure: {
      readyFrom,
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
  const [screen, setScreen] = useState<Screen>("search");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const place = useMemo(() => getPlace(form), [form]);
  const hasIncidentDetails = Boolean(
    form.scheduledDeparture ||
      form.newDeparture ||
      form.expectedArrival ||
      form.flightNumber ||
      form.airlineId ||
      form.sellerId ||
      form.disruptionType === "cancelled",
  );

  function setField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setSearchError(null);
  }

  function toggleMode(mode: TransportMode) {
    setForm((current) => ({
      ...current,
      modes: current.modes.includes(mode)
        ? current.modes.filter((item) => item !== mode)
        : [...current.modes, mode],
    }));
    setSearchError(null);
  }

  function resetPreferences() {
    setForm((current) => ({ ...current, ...DEFAULT_PREFERENCES }));
    setSearchError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;

    const validation = validateForm(form);
    setFieldErrors(validation.errors);
    setSearchError(null);

    if (Object.keys(validation.errors).length || !validation.place) return;
    if (!form.modes.length) {
      setSearchError("Выберите хотя бы один вид транспорта в дополнительных настройках.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildRequest(form, validation.place)),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const issue = payload?.issues?.[0];
        const serverField = {
          "departure.readyFrom": "readyFrom",
          "destination.arrivalDeadline": "arrivalDeadline",
          "incident.newDeparture": "newDeparture",
          "incident.expectedArrival": "expectedArrival",
        }[issue?.path] as keyof FormState | undefined;
        if (serverField && issue?.message) {
          setFieldErrors((current) => ({ ...current, [serverField]: issue.message }));
          return;
        }
        throw new Error(issue?.message || payload?.error || "Сервис маршрутов временно недоступен");
      }

      setResult(payload as SearchResponse);
      setScreen("results");
    } catch (caught) {
      const technicalMessage = caught instanceof Error ? caught.message : "";
      const safeMessage = /failed to fetch|unexpected token|json/i.test(technicalMessage)
        ? "Не удалось загрузить варианты. Проверьте связь и попробуйте снова."
        : technicalMessage;
      setSearchError(
        safeMessage || "Не удалось загрузить варианты. Проверьте связь и попробуйте снова.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <AppHeader onHome={() => setScreen("search")} />

      {screen === "search" && (
        <SearchScreen
          form={form}
          fieldErrors={fieldErrors}
          searchError={searchError}
          isLoading={isLoading}
          hasIncidentDetails={hasIncidentDetails}
          onField={setField}
          onToggleMode={toggleMode}
          onResetPreferences={resetPreferences}
          onSubmit={handleSubmit}
        />
      )}

      {screen === "results" && result && place && (
        <ResultsScreen
          response={result}
          form={form}
          place={place}
          hasIncidentDetails={hasIncidentDetails}
          onEdit={() => setScreen("search")}
          onSupport={() => setScreen("support")}
          onResetFilters={() => {
            resetPreferences();
            setScreen("search");
          }}
        />
      )}

      {screen === "support" && result && place && (
        <SupportScreen
          response={result}
          form={form}
          place={place}
          onBack={() => setScreen("results")}
        />
      )}
    </div>
  );
}

function AppHeader({
  onHome,
}: {
  onHome: () => void;
}) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <button className="brand" type="button" onClick={onHome} aria-label="Успеть — на главную">
          <span className="brand-mark" aria-hidden="true">У</span>
          <span>Успеть</span>
        </button>
        <span className="header-promise">Добраться вовремя после сбоя поездки</span>
      </div>
    </header>
  );
}

type SearchScreenProps = {
  form: FormState;
  fieldErrors: FieldErrors;
  searchError: string | null;
  isLoading: boolean;
  hasIncidentDetails: boolean;
  onField: <Key extends keyof FormState>(key: Key, value: FormState[Key]) => void;
  onToggleMode: (mode: TransportMode) => void;
  onResetPreferences: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function SearchScreen({
  form,
  fieldErrors,
  searchError,
  isLoading,
  hasIncidentDetails,
  onField,
  onToggleMode,
  onResetPreferences,
  onSubmit,
}: SearchScreenProps) {
  const activeFilters = getActiveFilters(form);

  return (
    <main className="search-screen">
      <section className="search-intro">
        <p className="eyebrow">Маршрут после сбоя</p>
        <h1>Как успеть к нужному времени?</h1>
        <p>Укажите главное — проверим самолёты, поезда и автобусы и покажем только то, что прибывает до дедлайна.</p>
      </section>

      <form id="rescue-search-form" className="search-form" onSubmit={onSubmit} noValidate>
        <div className="core-fields">
          <Field label="Где вы сейчас" error={fieldErrors.placeId} htmlFor="place">
            <select
              id="place"
              value={form.placeId}
              aria-invalid={Boolean(fieldErrors.placeId)}
              aria-describedby={fieldErrors.placeId ? "place-error" : undefined}
              onChange={(event) => onField("placeId", event.target.value)}
            >
              <option value="">Аэропорт или вокзал</option>
              {PLACE_OPTIONS.map((option) => (
                <option value={option.id} key={option.id}>{option.name}, {option.city}</option>
              ))}
              <option value="custom">Другая точка…</option>
            </select>
          </Field>

          <Field label="Куда нужно попасть" error={fieldErrors.destinationCity} htmlFor="destination">
            <input
              id="destination"
              list="cities"
              type="text"
              placeholder="Например, Москва"
              value={form.destinationCity}
              aria-invalid={Boolean(fieldErrors.destinationCity)}
              aria-describedby={fieldErrors.destinationCity ? "destination-error" : undefined}
              onChange={(event) => onField("destinationCity", event.target.value)}
            />
            <datalist id="cities"><option value="Москва" /><option value="Санкт-Петербург" /><option value="Сочи" /><option value="Казань" /></datalist>
          </Field>

          <Field label="Быть в городе не позже" error={fieldErrors.arrivalDeadline} htmlFor="deadline" featured>
            <input
              id="deadline"
              type="datetime-local"
              value={form.arrivalDeadline}
              aria-invalid={Boolean(fieldErrors.arrivalDeadline)}
              aria-describedby={fieldErrors.arrivalDeadline ? "arrivalDeadline-error" : undefined}
              onInput={(event) => onField("arrivalDeadline", event.currentTarget.value)}
            />
          </Field>

          <div className="field ready-field">
            <span className="field-label">Когда готовы отправиться</span>
            <div className="ready-choice" role="radiogroup" aria-label="Когда готовы отправиться">
              <label className={form.readyMode === "now" ? "active" : ""}>
                <input type="radio" name="ready-mode" checked={form.readyMode === "now"} onChange={() => onField("readyMode", "now")} />
                Сейчас
              </label>
              <label className={form.readyMode === "custom" ? "active" : ""}>
                <input type="radio" name="ready-mode" checked={form.readyMode === "custom"} onChange={() => onField("readyMode", "custom")} />
                Выбрать время
              </label>
            </div>
            {form.readyMode === "custom" && (
              <>
                <input
                  className="ready-time-input"
                  type="datetime-local"
                  aria-label="Готов отправиться не раньше"
                  value={form.readyFrom}
                  aria-invalid={Boolean(fieldErrors.readyFrom)}
                  aria-describedby={fieldErrors.readyFrom ? "readyFrom-error" : undefined}
                  onInput={(event) => onField("readyFrom", event.currentTarget.value)}
                />
                <FieldError id="readyFrom-error" message={fieldErrors.readyFrom} />
              </>
            )}
          </div>
        </div>

        {form.placeId === "custom" && (
          <div className="custom-place-fields">
            <Field label="Название аэропорта или вокзала" error={fieldErrors.customPlaceName} htmlFor="custom-place">
              <input id="custom-place" value={form.customPlaceName} aria-invalid={Boolean(fieldErrors.customPlaceName)} aria-describedby={fieldErrors.customPlaceName ? "custom-place-error" : undefined} onChange={(event) => onField("customPlaceName", event.target.value)} />
            </Field>
            <Field label="Город" error={fieldErrors.customPlaceCity} htmlFor="custom-city">
              <input id="custom-city" value={form.customPlaceCity} aria-invalid={Boolean(fieldErrors.customPlaceCity)} aria-describedby={fieldErrors.customPlaceCity ? "custom-city-error" : undefined} onChange={(event) => onField("customPlaceCity", event.target.value)} />
            </Field>
          </div>
        )}

        <button className="primary-button search-submit" type="submit" disabled={isLoading}>
          {isLoading ? <><span className="spinner" aria-hidden="true" /> Проверяем расписание…</> : "Найти, как успеть"}
        </button>

        <p className="search-scope">Сравниваем прибытие по расписанию. Дорогу до другой точки отправления покажем отдельно.</p>

        {searchError && (
          <div className="search-error" role="alert">
            <div><strong>Не получилось выполнить поиск</strong><span>{searchError}</span></div>
            <button type="submit" disabled={isLoading}>Попробовать снова</button>
          </div>
        )}

        <div className="progressive-sections">
          <details className="expandable">
            <summary>
              <span><strong>Исходный рейс</strong><small>Необязательно — для статуса и контактов поддержки</small></span>
              {hasIncidentDetails && <b>Добавлено</b>}
            </summary>
            <div className="expandable-body incident-fields">
              <div className="status-choice" role="radiogroup" aria-label="Что случилось с рейсом">
                <label className={form.disruptionType === "delayed" ? "active" : ""}><input type="radio" name="disruption" checked={form.disruptionType === "delayed"} onChange={() => onField("disruptionType", "delayed")} />Рейс перенесли</label>
                <label className={form.disruptionType === "cancelled" ? "active" : ""}><input type="radio" name="disruption" checked={form.disruptionType === "cancelled"} onChange={() => onField("disruptionType", "cancelled")} />Рейс отменили</label>
              </div>
              <div className="optional-grid">
                <Field label="Изначально отправлялся" error={fieldErrors.scheduledDeparture} htmlFor="scheduled">
                  <input id="scheduled" type="datetime-local" value={form.scheduledDeparture} onInput={(event) => onField("scheduledDeparture", event.currentTarget.value)} />
                </Field>
                {form.disruptionType === "delayed" && (
                  <Field label="Теперь отправляется" error={fieldErrors.newDeparture} htmlFor="new-departure">
                    <input id="new-departure" type="datetime-local" value={form.newDeparture} onInput={(event) => onField("newDeparture", event.currentTarget.value)} />
                  </Field>
                )}
                <Field label="Ожидаемое прибытие" error={fieldErrors.expectedArrival} htmlFor="expected-arrival">
                  <input id="expected-arrival" type="datetime-local" value={form.expectedArrival} onInput={(event) => onField("expectedArrival", event.currentTarget.value)} />
                </Field>
                <Field label="Номер рейса" htmlFor="flight-number">
                  <input id="flight-number" placeholder="Например, SU 15" value={form.flightNumber} onChange={(event) => onField("flightNumber", event.target.value)} />
                </Field>
                <Field label="Авиакомпания" htmlFor="airline">
                  <select id="airline" value={form.airlineId} onChange={(event) => onField("airlineId", event.target.value)}><option value="">Не указывать</option><option value="aeroflot">Аэрофлот</option></select>
                </Field>
                <Field label="Где куплен билет" htmlFor="seller">
                  <select id="seller" value={form.sellerId} onChange={(event) => onField("sellerId", event.target.value)}><option value="">Не указывать</option><option value="tutu">Туту</option></select>
                </Field>
              </div>
              {hasIncidentDetails && <IncidentStatus form={form} />}
            </div>
          </details>

          <details className="expandable">
            <summary>
              <span><strong>Дополнительные настройки</strong><small>Транспорт, бюджет, пассажиры и пересадки</small></span>
              {activeFilters.length > 0 && <b>{activeFilters.length}</b>}
            </summary>
            <div className="expandable-body">
              <div className="filter-heading">
                <p>Откройте только если нужно сузить поиск.</p>
                <button type="button" onClick={onResetPreferences}>Сбросить ограничения</button>
              </div>
              <div className="optional-grid filter-grid">
                <div className="field wide-field">
                  <span className="field-label">Транспорт</span>
                  <div className="chip-group">
                    {ALL_MODES.map((mode) => (
                      <label className={form.modes.includes(mode) ? "chip active" : "chip"} key={mode}>
                        <input type="checkbox" checked={form.modes.includes(mode)} onChange={() => onToggleMode(mode)} />
                        {MODE_LABELS[mode]}
                      </label>
                    ))}
                  </div>
                </div>
                <Field label="Пассажиров" htmlFor="passengers"><input id="passengers" type="number" min="1" max="9" value={form.passengers} onChange={(event) => onField("passengers", Number(event.target.value))} /></Field>
                <Field label="Бюджет до" htmlFor="budget"><div className="input-suffix"><input id="budget" type="number" min="1" placeholder="Без ограничения" value={form.maxPrice} onChange={(event) => onField("maxPrice", event.target.value)} /><b>₽</b></div></Field>
                <Field label="Пересадок" htmlFor="transfers"><select id="transfers" value={form.maxTransfers} onChange={(event) => onField("maxTransfers", Number(event.target.value))}><option value={0}>Только прямые</option><option value={1}>Не больше 1</option><option value={2}>Не больше 2</option><option value={3}>Не больше 3</option></select></Field>
                <Field label="Что важнее" htmlFor="priority"><select id="priority" value={form.priority} onChange={(event) => onField("priority", event.target.value as ResultCategory)}><option value="fastest">Больше запас времени</option><option value="cheapest">Ниже цена</option><option value="fewest_transfers">Меньше пересадок</option></select></Field>
                <div className="switch-row wide-field">
                  <input id="other-places" type="checkbox" checked={form.allowOtherPlaces} onChange={(event) => onField("allowOtherPlaces", event.target.checked)} />
                  <span className="switch" aria-hidden="true" />
                  <label htmlFor="other-places"><strong>Искать из других вокзалов и аэропортов города</strong><small>Время дороги до них не входит в расчёт</small></label>
                </div>
              </div>
            </div>
          </details>
        </div>

        {activeFilters.length > 0 && (
          <div className="active-filters" aria-label="Активные ограничения">
            <span>Активно:</span>
            {activeFilters.map((filter) => <b key={filter}>{filter}</b>)}
            <button type="button" onClick={onResetPreferences}>Сбросить</button>
          </div>
        )}
      </form>
    </main>
  );
}

function Field({
  label,
  error,
  htmlFor,
  featured = false,
  children,
}: {
  label: string;
  error?: string;
  htmlFor: string;
  featured?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`field${featured ? " featured-field" : ""}`} htmlFor={htmlFor}>
      <span className="field-label">{label}</span>
      {children}
      <FieldError id={`${htmlFor === "deadline" ? "arrivalDeadline" : htmlFor}-error`} message={error} />
    </label>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <span className="field-error" id={id}>{message}</span>;
}

function getActiveFilters(form: FormState) {
  const filters: string[] = [];
  if (form.passengers !== 1) filters.push(`${form.passengers} пассажира`);
  if (form.maxPrice) filters.push(`до ${formatMoney(Number(form.maxPrice))}`);
  if (form.maxTransfers !== 3) filters.push(form.maxTransfers === 0 ? "без пересадок" : `до ${form.maxTransfers} перес.`);
  if (form.modes.length !== ALL_MODES.length) filters.push(form.modes.map((mode) => MODE_LABELS[mode]).join(", "));
  if (!form.allowOtherPlaces) filters.push("только текущая точка");
  if (form.priority !== "fastest") filters.push(form.priority === "cheapest" ? "сначала дешевле" : "меньше пересадок");
  return filters;
}

function IncidentStatus({ form }: { form: FormState }) {
  const misses = Boolean(
    form.arrivalDeadline &&
      ((form.expectedArrival && Date.parse(form.expectedArrival) > Date.parse(form.arrivalDeadline)) ||
        (form.newDeparture && Date.parse(form.newDeparture) >= Date.parse(form.arrivalDeadline))),
  );

  return (
    <div className={`incident-status${misses || form.disruptionType === "cancelled" ? " incident-alert" : ""}`}>
      <div>
        <span>{form.disruptionType === "cancelled" ? "Рейс отменён" : "Рейс перенесён"}</span>
        <strong>
          {form.flightNumber || "Исходный рейс"}
          {form.scheduledDeparture && form.newDeparture
            ? `: ${formatInputTime(form.scheduledDeparture)} → ${formatInputTime(form.newDeparture)}`
            : ""}
        </strong>
        {misses && <p>С этим рейсом вы не успеваете к указанному времени.</p>}
      </div>
      <button type="submit">Найти другой способ</button>
    </div>
  );
}

function ResultsScreen({
  response,
  form,
  place,
  hasIncidentDetails,
  onEdit,
  onSupport,
  onResetFilters,
}: {
  response: SearchResponse;
  form: FormState;
  place: PlaceOption;
  hasIncidentDetails: boolean;
  onEdit: () => void;
  onSupport: () => void;
  onResetFilters: () => void;
}) {
  const journeyCopy = JOURNEY_COPY[response.currentJourneyStatus];
  const activeFilters = getActiveFilters(form);

  return (
    <main className="results-screen">
      <section className="result-query" aria-label="Параметры поиска">
        <div><span>Маршрут</span><strong>{place.name} → {form.destinationCity}</strong></div>
        <div><span>Нужно успеть</span><strong>{formatDateTime(form.arrivalDeadline)}</strong></div>
        <div><span>Готовность</span><strong>{form.readyMode === "now" ? "Сейчас" : formatDateTime(form.readyFrom)}</strong></div>
        <button type="button" onClick={onEdit}>Изменить</button>
      </section>

      <div className="results-content">
        <div className="results-heading">
          <div><p className="eyebrow">Маршруты до дедлайна</p><h1>{response.options.length ? "Вот как можно успеть" : "До дедлайна вариантов нет"}</h1></div>
          {response.options.length > 0 && <span>{response.options.length} подходящих</span>}
        </div>

        <div className="deadline-note">
          <span aria-hidden="true">✓</span>
          <p><strong>Дедлайн: {formatDateTime(form.arrivalDeadline)}</strong>В основной список попадают только варианты, которые прибывают не позже этого времени.</p>
        </div>

        {hasIncidentDetails && (
          <div className={`journey-status status-${response.currentJourneyStatus}`}>
            <span className="status-symbol" aria-hidden="true">{response.currentJourneyStatus === "fits" ? "✓" : response.currentJourneyStatus === "unknown" ? "?" : "!"}</span>
            <div><strong>{journeyCopy.title}</strong><p>{journeyCopy.text}</p></div>
          </div>
        )}

        {response.options.length > 0 ? (
          <div className="result-list">
            {response.options.map((option, index) => (
              <ResultCard
                option={option}
                currentPlaceId={place.id}
                key={option.id}
                emphasized={index === 0}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            response={response}
            form={form}
            place={place}
            hasFilters={activeFilters.length > 0}
            onEdit={onEdit}
            onResetFilters={onResetFilters}
          />
        )}

        <section className="support-prompt">
          <div><span aria-hidden="true">?</span><p><strong>Помощь с исходным билетом</strong>Контакты перевозчика, аэропорта и продавца — отдельно от поиска нового маршрута.</p></div>
          <button type="button" onClick={onSupport}>Открыть поддержку</button>
        </section>
      </div>
    </main>
  );
}

function ResultCard({
  option,
  currentPlaceId,
  emphasized,
}: {
  option: RescueOption;
  currentPlaceId: string;
  emphasized: boolean;
}) {
  const smallMargin = option.deadlineMarginMinutes <= 60;
  const startsElsewhere = option.segments[0]?.fromPlaceId !== currentPlaceId;
  const transport = Array.from(new Set(option.segments.map((segment) => MODE_LABELS[segment.mode]))).join(" + ");
  const route = option.segments.map((segment) => `${segment.fromStation} → ${segment.toStation}`).join(" · ");

  return (
    <article className={`result-card${smallMargin ? " result-card-risk" : ""}`}>
      <div className="result-card-top">
        <span className="result-category">{CATEGORY_LABELS[option.category]}</span>
        <span className="transport-label">{transport}</span>
      </div>

      <div className="result-timeline">
        <div><time>{formatTime(option.departureAt)}</time><span>{option.segments[0]?.fromStation}</span></div>
        <div className="timeline-line"><span>{option.transferCount === 0 ? "Без пересадок" : `${option.transferCount} перес.`}</span><i /></div>
        <div><time>{formatTime(option.arrivalAt)}</time><span>{option.segments.at(-1)?.toStation}</span></div>
      </div>

      <p className="route-description">{route}</p>

      <div className={`margin-block${smallMargin ? " margin-risk" : ""}`}>
        <span aria-hidden="true">{smallMargin ? "!" : "✓"}</span>
        <p><strong>{smallMargin ? "Успеваете, но запас небольшой" : "Успеваете с запасом"}</strong><b>{formatDuration(option.deadlineMarginMinutes)}</b><small>до дедлайна</small></p>
      </div>

      <div className="result-buy">
        <div><span>Цена за всех</span><strong>{option.totalPrice > 0 ? formatMoney(option.totalPrice) : "Цена уточняется"}</strong>{option.seatsLeft ? <small>Осталось мест: {option.seatsLeft}</small> : <small>Наличие уточняется</small>}</div>
        <a className={emphasized ? "primary-button ticket-button" : "secondary-button ticket-button"} href={option.bookingUrl} target="_blank" rel="noreferrer">Открыть билет</a>
      </div>

      <div className="result-warnings">
        {startsElsewhere && <p><strong>Нужно сменить точку отправления.</strong> Самостоятельно доберитесь до точки «{option.segments[0]?.fromStation}»; это время не входит в расчёт.</p>}
        <p>Проверено по опубликованному расписанию; новые задержки не учтены.</p>
      </div>
    </article>
  );
}

function EmptyState({
  response,
  form,
  place,
  hasFilters,
  onEdit,
  onResetFilters,
}: {
  response: SearchResponse;
  form: FormState;
  place: PlaceOption;
  hasFilters: boolean;
  onEdit: () => void;
  onResetFilters: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-main">
        <span className="empty-icon" aria-hidden="true">×</span>
        <h2>Не нашли маршрут, который прибывает вовремя</h2>
        <p>Проверили доступные виды транспорта из точки «{place.name}» и других точек города до города «{form.destinationCity}» к {formatDateTime(form.arrivalDeadline)}.</p>
        <ul>
          <li>проверьте другую точку отправления;</li>
          <li>разрешите больше пересадок или видов транспорта;</li>
          <li>проверьте, не ограничен ли поиск бюджетом.</li>
        </ul>
        <div className="empty-actions">
          {hasFilters && <button className="primary-button" type="button" onClick={onResetFilters}>Снять ограничения</button>}
          <button className="secondary-button" type="button" onClick={onEdit}>Изменить поиск</button>
        </div>
      </div>

      {response.nearestAfterDeadline && (
        <div className="late-option">
          <span>Ближайший вариант после дедлайна</span>
          <strong>{formatTime(response.nearestAfterDeadline.departureAt)} → {formatTime(response.nearestAfterDeadline.arrivalAt)}</strong>
          <p>{response.nearestAfterDeadline.segments[0]?.fromStation} → {response.nearestAfterDeadline.segments.at(-1)?.toStation}</p>
          <b>Не успевает: позже на {formatDuration(response.nearestAfterDeadline.missedDeadlineByMinutes)}</b>
        </div>
      )}
    </div>
  );
}

function SupportScreen({
  response,
  form,
  place,
  onBack,
}: {
  response: SearchResponse;
  form: FormState;
  place: PlaceOption;
  onBack: () => void;
}) {
  const hasIncidentDetails = Boolean(
    form.scheduledDeparture ||
      form.newDeparture ||
      form.expectedArrival ||
      form.flightNumber ||
      form.airlineId ||
      form.sellerId ||
      form.disruptionType === "cancelled",
  );

  return (
    <main className="support-screen">
      <button className="back-button" type="button" onClick={onBack}>← Вернуться к вариантам</button>
      <div className="support-heading">
        <p className="eyebrow">Исходный билет</p>
        <h1>Кому обратиться за помощью</h1>
        <p>Поддержка отделена от поиска нового маршрута, чтобы не мешать главной задаче — успеть.</p>
      </div>

      <div className="support-summary">
        <div><span>Вы сейчас</span><strong>{place.name}</strong></div>
        <div><span>Направление</span><strong>{form.destinationCity}</strong></div>
        <div><span>Ситуация</span><strong>{hasIncidentDetails ? (form.disruptionType === "cancelled" ? "Рейс отменён" : "Рейс перенесён") : "Данные не добавлены"}</strong></div>
        {form.flightNumber && <div><span>Рейс</span><strong>{form.flightNumber}</strong></div>}
      </div>

      <section className="contacts-panel" aria-labelledby="contacts-title">
        <h2 id="contacts-title">Контакты по вашим данным</h2>
        {response.support.contacts.length > 0 ? (
          <div className="contact-list">
            {response.support.contacts.map((contact) => (
              <article className="contact-card" key={contact.id}>
                <div><span className="contact-type">{CONTACT_LABELS[contact.type]}</span><h3>{contact.name}</h3><p>{contact.description}</p></div>
                {contact.phone && <a className="phone" href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}>{contact.phone}</a>}
                <div className="contact-links">
                  {contact.supportUrl && <a href={contact.supportUrl} target="_blank" rel="noreferrer">Открыть помощь ↗</a>}
                  <a href={contact.sourceUrl} target="_blank" rel="noreferrer">Официальный источник ↗</a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="no-contacts"><p>Не хватает данных для точных контактов.</p><span>Добавьте авиакомпанию или продавца в блоке «Исходный рейс» либо обратитесь на стойку информации.</span></div>
        )}
      </section>

      <details className="action-details">
        <summary>Показать план действий</summary>
        <ol>{response.support.actionPlan.map((item, index) => <li key={item}><span>{index + 1}</span><p>{item}</p></li>)}</ol>
      </details>
    </main>
  );
}
