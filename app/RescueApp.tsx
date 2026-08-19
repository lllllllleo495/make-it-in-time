"use client";

import { type CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import supportData from "../data/support-data.json";
import type {
  RescueOption,
  RescueSearchRequest,
  ResultCategory,
  SearchResponse,
  SupportAction,
  TransportMode,
} from "../lib/domain";

type Screen = "route" | "preferences" | "results" | "support";
type MainScreen = Exclude<Screen, "support">;
type PlaceOption = RescueSearchRequest["incident"]["currentPlace"];
type PlaceSearchOption = PlaceOption & { code: string; aliases: string[] };
type Baggage = "carry_on" | "checked";
type FieldErrors = Partial<Record<keyof FormState, string>>;

const PLACE_OPTIONS: PlaceSearchOption[] = supportData.airports.map((location) => ({
  id: location.id,
  name: location.name,
  city: location.city,
  type: "airport",
  code: location.iata,
  aliases: location.aliases,
}));

const AIRLINE_OPTIONS = supportData.airlines.map(({ id, name }) => ({ id, name }));
const SELLER_OPTIONS = supportData.sellers.map(({ id, name }) => ({ id, name }));
const CITY_OPTIONS = Array.from(new Set(PLACE_OPTIONS.map((place) => place.city)));

const ALL_MODES: TransportMode[] = ["plane", "train", "bus", "suburban"];
const MIN_SEARCH_DURATION_MS = 1_950;

const MODE_LABELS: Record<TransportMode, string> = {
  plane: "Самолёт",
  train: "Поезд",
  bus: "Автобус",
  suburban: "Электричка",
};

const MODE_ICONS: Record<TransportMode, string> = {
  plane: "✈️",
  train: "🚆",
  bus: "🚌",
  suburban: "🚊",
};

const CATEGORY_LABELS: Record<ResultCategory, string> = {
  fastest: "Больше всего запаса",
  cheapest: "Самый выгодный",
  fewest_transfers: "Меньше пересадок",
};

type FormState = {
  placeId: string;
  placeQuery: string;
  destinationCity: string;
  arrivalDeadline: string;
  passengers: number;
  baggage: Baggage;
  modes: TransportMode[];
  maxPrice: string;
  airlineId: string;
  sellerId: string;
};

const EMPTY_FORM: FormState = {
  placeId: "",
  placeQuery: "",
  destinationCity: "",
  arrivalDeadline: "",
  passengers: 1,
  baggage: "carry_on",
  modes: ALL_MODES,
  maxPrice: "",
  airlineId: "",
  sellerId: "",
};

const SEARCH_FIELDS = new Set<keyof FormState>([
  "placeId",
  "placeQuery",
  "destinationCity",
  "arrivalDeadline",
  "passengers",
  "baggage",
  "modes",
  "maxPrice",
]);
const SUPPORT_FIELDS = new Set<keyof FormState>([
  "airlineId",
  "sellerId",
]);

function trackSupportEvent(event: string, params: Record<string, string> = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("uspet:analytics", { detail: { event, ...params } }));
}

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

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} мин`;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

function formatMoney(value: number, currency = "RUB") {
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function withoutTerminalPeriod(value: string) {
  return value.trimEnd().replace(/\.$/u, "");
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function getPlace(form: FormState): PlaceOption | undefined {
  const selected = PLACE_OPTIONS.find((option) => option.id === form.placeId);
  if (selected) return selected;
  if (form.placeQuery.trim().length >= 2) {
    return {
      id: "custom-location",
      name: form.placeQuery.trim(),
      city: form.placeQuery.trim(),
      type: "airport",
    };
  }
  return undefined;
}

function validateRoute(form: FormState) {
  const errors: FieldErrors = {};
  const place = getPlace(form);

  if (!place) errors.placeQuery = "Введите город, аэропорт или вокзал";
  if (!form.destinationCity.trim()) {
    errors.destinationCity = "Укажите город назначения";
  }

  const deadline = Date.parse(form.arrivalDeadline);
  if (!form.arrivalDeadline || Number.isNaN(deadline)) {
    errors.arrivalDeadline = "Укажите дату и время";
  } else if (deadline <= Date.now()) {
    errors.arrivalDeadline = "Дедлайн должен быть позже текущего времени";
  }

  return { errors, place };
}

function validatePreferences(form: FormState) {
  const errors: FieldErrors = {};
  if (!Number.isInteger(form.passengers) || form.passengers < 1 || form.passengers > 6) {
    errors.passengers = "От 1 до 6 пассажиров";
  }
  if (form.maxPrice && Number(form.maxPrice) < 500) {
    errors.maxPrice = "Минимальный бюджет — 500 ₽";
  }
  if (!form.modes.length) {
    errors.modes = "Выберите хотя бы один вид транспорта";
  }
  return errors;
}

function buildRequest(form: FormState, place: PlaceOption): RescueSearchRequest {
  const now = new Date().toISOString();
  return {
    incident: {
      currentPlace: place,
      currentTime: now,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      disruptionType: "delayed",
    },
    destination: {
      city: form.destinationCity.trim(),
      arrivalDeadline: toIso(form.arrivalDeadline, "Дедлайн"),
    },
    departure: {
      readyFrom: now,
      allowOtherPlaces: true,
    },
    preferences: {
      passengers: form.passengers,
      baggage: form.baggage,
      modes: form.modes,
      priority: "fastest",
      maxPrice: form.maxPrice ? Number(form.maxPrice) : undefined,
      maxTransfers: 3,
    },
  };
}

export function RescueApp() {
  const [screen, setScreen] = useState<Screen>("route");
  const [returnScreen, setReturnScreen] = useState<MainScreen>("route");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [support, setSupport] = useState<SearchResponse["support"] | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [searchError, setSearchError] = useState<string | null>(null);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupportLoading, setIsSupportLoading] = useState(false);

  const place = useMemo(() => getPlace(form), [form]);

  function setField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setSearchError(null);
    setSupportError(null);
    if (SEARCH_FIELDS.has(key)) {
      setResult(null);
    }
    if (SUPPORT_FIELDS.has(key)) {
      setSupport(null);
    }
  }

  function toggleMode(mode: TransportMode) {
    setForm((current) => ({
      ...current,
      modes: current.modes.includes(mode)
        ? current.modes.filter((item) => item !== mode)
        : [...current.modes, mode],
    }));
    setFieldErrors((current) => ({ ...current, modes: undefined }));
    setResult(null);
  }

  function continueToPreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateRoute(form);
    setFieldErrors(validation.errors);
    if (Object.keys(validation.errors).length || !validation.place) return;
    setScreen("preferences");
  }

  async function searchRoutes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;

    const routeValidation = validateRoute(form);
    const preferenceErrors = validatePreferences(form);
    const errors = { ...routeValidation.errors, ...preferenceErrors };
    setFieldErrors(errors);
    setSearchError(null);

    if (Object.keys(routeValidation.errors).length || !routeValidation.place) {
      setScreen("route");
      return;
    }
    if (Object.keys(preferenceErrors).length) return;

    const searchStartedAt = Date.now();
    setIsLoading(true);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildRequest(form, routeValidation.place)),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.issues?.[0]?.message || payload?.error || "Не удалось загрузить варианты");
      }
      const waitTime = MIN_SEARCH_DURATION_MS - (Date.now() - searchStartedAt);
      if (waitTime > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, waitTime));
      }
      setResult(payload as SearchResponse);
      setReturnScreen((current) => current === "preferences" ? "results" : current);
      setScreen((current) => current === "preferences" ? "results" : current);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setSearchError(
        /failed to fetch|unexpected token|json/i.test(message)
          ? "Не удалось загрузить варианты. Проверьте связь и попробуйте снова."
          : message || "Не удалось загрузить варианты. Попробуйте снова.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSupportLoading) return;
    if (!place) {
      setSupportError("Укажите, где вы сейчас");
      return;
    }
    setSupportError(null);
    setIsSupportLoading(true);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPlaceId: place.id,
          airlineId: form.airlineId || undefined,
          sellerId: form.sellerId || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Не удалось загрузить контакты");
      setSupport(payload as SearchResponse["support"]);
      for (const miss of payload?.misses ?? []) {
        trackSupportEvent("support_directory_miss", {
          entityType: miss.entityType,
          entityId: miss.entityId,
        });
      }
    } catch (caught) {
      setSupportError(caught instanceof Error ? caught.message : "Не удалось загрузить контакты");
    } finally {
      setIsSupportLoading(false);
    }
  }

  const goTo = (next: Screen) => {
    if (next === "results" && !result) return;
    setScreen(next);
  };

  function toggleSupport() {
    if (screen === "support") {
      setScreen(returnScreen);
      return;
    }
    setReturnScreen(screen);
    setScreen("support");
  }

  return (
    <div className="app-shell">
      <AppHeader
        screen={screen === "support" ? returnScreen : screen}
        canOpenPreferences={Boolean(place && form.destinationCity.trim() && form.arrivalDeadline)}
        hasResults={Boolean(result)}
        onNavigate={goTo}
      />

      {screen === "route" && (
        <RouteScreen
          form={form}
          fieldErrors={fieldErrors}
          onField={setField}
          onSubmit={continueToPreferences}
        />
      )}

      {screen === "preferences" && place && (
        <PreferencesScreen
          form={form}
          place={place}
          fieldErrors={fieldErrors}
          searchError={searchError}
          isLoading={isLoading}
          onField={setField}
          onToggleMode={toggleMode}
          onBack={() => setScreen("route")}
          onSubmit={searchRoutes}
        />
      )}

      {screen === "results" && result && place && (
        <ResultsScreen
          response={result}
          form={form}
          place={place}
          onEditRoute={() => setScreen("route")}
          onEditPreferences={() => setScreen("preferences")}
        />
      )}

      {screen === "support" && (
        <SupportScreen
          form={form}
          place={place}
          support={support}
          supportError={supportError}
          isLoading={isSupportLoading}
          onField={setField}
          onBack={toggleSupport}
          onSubmit={loadSupport}
        />
      )}

      <button
        className={`support-launcher${screen === "support" ? " active" : ""}`}
        type="button"
        aria-label={screen === "support" ? "Закрыть помощь" : "Открыть помощь с рейсом"}
        onClick={toggleSupport}
      >
        <span aria-hidden="true">{screen === "support" ? "×" : "?"}</span>
        {screen === "support" ? "Закрыть" : "Помощь с рейсом"}
      </button>
    </div>
  );
}

function AppHeader({
  screen,
  canOpenPreferences,
  hasResults,
  onNavigate,
}: {
  screen: Screen;
  canOpenPreferences: boolean;
  hasResults: boolean;
  onNavigate: (screen: Screen) => void;
}) {
  const steps: { id: Screen; label: string }[] = [
    { id: "route", label: "Маршрут" },
    { id: "preferences", label: "Детали" },
    { id: "results", label: "Варианты" },
  ];
  const currentIndex = steps.findIndex((step) => step.id === screen);

  return (
    <header className="app-header">
      <div className="header-inner">
        <button className="brand" type="button" onClick={() => onNavigate("route")} aria-label="Успеть — к маршруту">
          <span className="brand-mark" aria-hidden="true">У</span>
          <span>Успеть</span>
        </button>
        <nav className="step-nav" aria-label="Этапы">
          {steps.map((step, index) => {
            const canOpen = step.id === "route" || (step.id === "preferences" && canOpenPreferences) || (step.id === "results" && hasResults);
            return (
              <button
                className={`${screen === step.id ? "active " : ""}${index < currentIndex ? "done" : ""}`.trim()}
                type="button"
                disabled={!canOpen}
                onClick={() => onNavigate(step.id)}
                key={step.id}
              >
                <span>{index + 1}</span>{step.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

type SharedFormProps = {
  form: FormState;
  fieldErrors: FieldErrors;
  onField: <Key extends keyof FormState>(key: Key, value: FormState[Key]) => void;
};

function RouteScreen({
  form,
  fieldErrors,
  onField,
  onSubmit,
}: SharedFormProps & { onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <main className="flow-screen route-screen">
      <section className="page-heading">
        <h1>Найдём способ <span>успеть</span></h1>
        <p>Покажем только билеты, которые по расписанию прибывают до вашего дедлайна</p>
      </section>

      <form id="route-form" className="panel route-form" onSubmit={onSubmit} noValidate>
        <div className="route-fields">
          <SearchablePlace
            value={form.placeQuery}
            selectedId={form.placeId}
            error={fieldErrors.placeQuery}
            onQueryChange={(value) => {
              onField("placeQuery", value);
              onField("placeId", "");
            }}
            onSelect={(option) => {
              onField("placeId", option.id);
              onField("placeQuery", `${option.city}, ${option.name}`);
            }}
          />

          <SearchableDestination
            value={form.destinationCity}
            error={fieldErrors.destinationCity}
            onChange={(value) => onField("destinationCity", value)}
          />

          <Field label="Быть на месте не позже" error={fieldErrors.arrivalDeadline} htmlFor="deadline">
            <input
              id="deadline"
              type="datetime-local"
              value={form.arrivalDeadline}
              aria-invalid={Boolean(fieldErrors.arrivalDeadline)}
              onInput={(event) => onField("arrivalDeadline", event.currentTarget.value)}
            />
          </Field>
        </div>

        <div className="form-actions">
          <button className="primary-button compact-button" type="submit">Продолжить</button>
        </div>
      </form>
    </main>
  );
}

function SearchablePlace({
  value,
  selectedId,
  error,
  onQueryChange,
  onSelect,
}: {
  value: string;
  selectedId: string;
  error?: string;
  onQueryChange: (value: string) => void;
  onSelect: (option: PlaceSearchOption) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const normalizedQuery = value.trim().toLocaleLowerCase("ru-RU");
  const filtered = PLACE_OPTIONS.filter((option) => {
    if (!normalizedQuery) return true;
    return [option.name, option.city, option.code, ...option.aliases]
      .join(" ")
      .toLocaleLowerCase("ru-RU")
      .includes(normalizedQuery);
  }).slice(0, 7);

  return (
    <div className="field place-combobox">
      <label className="field-label" htmlFor="place-search">Где вы сейчас</label>
      <input
        id="place-search"
        type="text"
        role="combobox"
        autoComplete="off"
        placeholder="Город, аэропорт или вокзал"
        value={value}
        aria-expanded={isOpen}
        aria-controls="place-options"
        aria-invalid={Boolean(error)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setIsOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && isOpen && filtered[0]) {
            event.preventDefault();
            onSelect(filtered[0]);
            setIsOpen(false);
          }
        }}
      />
      {isOpen && filtered.length > 0 && (
        <div className="place-options" id="place-options" role="listbox">
          {filtered.map((option) => (
            <button
              className={selectedId === option.id ? "selected" : ""}
              type="button"
              role="option"
              aria-selected={selectedId === option.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(option);
                setIsOpen(false);
              }}
              key={option.id}
            >
              <span className="place-icon" aria-hidden="true">{option.type === "airport" ? "✈" : "●"}</span>
              <span><strong>{option.city}</strong><small>{option.name}</small></span>
              {option.code && <b>{option.code}</b>}
            </button>
          ))}
        </div>
      )}
      <FieldError id="place-search-error" message={error} />
    </div>
  );
}

function SearchableDestination({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const normalizedQuery = value.trim().toLocaleLowerCase("ru-RU");
  const filtered = CITY_OPTIONS.filter((city) =>
    !normalizedQuery || city.toLocaleLowerCase("ru-RU").includes(normalizedQuery),
  ).slice(0, 7);

  function choose(city: string) {
    onChange(city);
    setIsOpen(false);
  }

  return (
    <div className="field place-combobox destination-combobox">
      <label className="field-label" htmlFor="destination">Куда нужно попасть</label>
      <input
        id="destination"
        type="text"
        role="combobox"
        autoComplete="off"
        placeholder="Например, Москва"
        value={value}
        aria-expanded={isOpen}
        aria-controls="destination-options"
        aria-invalid={Boolean(error)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && isOpen && filtered[0]) {
            event.preventDefault();
            choose(filtered[0]);
          }
        }}
      />
      {isOpen && filtered.length > 0 && (
        <div className="place-options destination-options" id="destination-options" role="listbox">
          {filtered.map((city) => (
            <button
              className={value === city ? "selected" : ""}
              type="button"
              role="option"
              aria-selected={value === city}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(city)}
              key={city}
            >
              <span className="place-icon" aria-hidden="true">●</span>
              <span><strong>{city}</strong><small>Город</small></span>
            </button>
          ))}
        </div>
      )}
      <FieldError id="destination-error" message={error} />
    </div>
  );
}

function PreferencesScreen({
  form,
  place,
  fieldErrors,
  searchError,
  isLoading,
  onField,
  onToggleMode,
  onBack,
  onSubmit,
}: SharedFormProps & {
  place: PlaceOption;
  searchError: string | null;
  isLoading: boolean;
  onToggleMode: (mode: TransportMode) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (isLoading) {
    return (
      <main className="flow-screen preferences-screen searching-screen">
        <section className="page-heading compact-heading searching-heading">
          <h1>Ищем варианты</h1>
          <p>Собираем билеты и сверяем их с вашим дедлайном</p>
        </section>
        <TripSummary place={place} form={form} />
        <SearchingState destination={form.destinationCity} modes={form.modes} />
      </main>
    );
  }

  return (
    <main className="flow-screen preferences-screen">
      <section className="page-heading compact-heading">
        <h1>Что учесть?</h1>
        <p>Выберите подходящие условия — и найдём варианты</p>
      </section>
      <TripSummary place={place} form={form} />

      <form id="preferences-form" className="panel preferences-form" onSubmit={onSubmit} noValidate>
        <div className="preference-grid">
          <div className="field baggage-field">
            <span className="field-label">Багаж</span>
            <div className="chip-group baggage-chip-group" role="radiogroup" aria-label="Багаж">
              {([
                ["carry_on", "Ручная кладь"],
                ["checked", "С багажом"],
              ] as [Baggage, string][]).map(([value, label]) => (
                <label className={form.baggage === value ? "chip active" : "chip"} key={value}>
                  <input type="radio" name="baggage" checked={form.baggage === value} onChange={() => onField("baggage", value)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="field passengers-field">
            <span className="field-label">Пассажиры</span>
            <div className="passenger-counter" role="group" aria-label="Количество пассажиров">
              <button type="button" aria-label="Уменьшить количество пассажиров" disabled={form.passengers <= 1} onClick={() => onField("passengers", form.passengers - 1)}>−</button>
              <strong aria-live="polite">{form.passengers}</strong>
              <button type="button" aria-label="Увеличить количество пассажиров" disabled={form.passengers >= 6} onClick={() => onField("passengers", form.passengers + 1)}>+</button>
            </div>
            <FieldError id="passengers-error" message={fieldErrors.passengers} />
          </div>

          <BudgetInput value={form.maxPrice} error={fieldErrors.maxPrice} onChange={(value) => onField("maxPrice", value)} />

          <div className="field transport-field">
            <span className="field-label">Транспорт</span>
            <div className="chip-group">
              {ALL_MODES.map((mode) => (
                <label className={form.modes.includes(mode) ? "chip active" : "chip"} key={mode}>
                  <input type="checkbox" checked={form.modes.includes(mode)} onChange={() => onToggleMode(mode)} />
                  {MODE_LABELS[mode]}
                </label>
              ))}
            </div>
            <FieldError id="modes-error" message={fieldErrors.modes} />
          </div>
        </div>

        {searchError && <div className="inline-error" role="alert">{searchError}</div>}

        <div className="form-actions">
          <button className="text-button" type="button" onClick={onBack}>Назад</button>
          <button className="primary-button compact-button" type="submit" disabled={isLoading}>
            {isLoading ? <><span className="spinner" />Ищем</> : "Найти варианты"}
          </button>
        </div>
      </form>
    </main>
  );
}

function SearchingState({ destination, modes }: { destination: string; modes: TransportMode[] }) {
  const [activeStep, setActiveStep] = useState(0);
  const steps = [
    "Ищем предложения на Туту",
    "Сверяем время прибытия",
    "Оставляем варианты до дедлайна",
  ];
  const shownModes = modes.length ? modes : ALL_MODES;

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setActiveStep(1), 650),
      window.setTimeout(() => setActiveStep(2), 1_300),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return (
    <section className="searching-card" aria-live="polite" aria-busy="true">
      <div className="searching-copy">
        <span className="searching-kicker">Поиск на Туту</span>
        <h2>Сравниваем способы<br />Направление: {destination}</h2>
        <p>{steps[activeStep]}</p>
      </div>
      <div className="searching-routes" aria-hidden="true">
        {shownModes.map((mode, index) => (
          <div className="searching-route" style={{ "--route-delay": `${index * 140}ms` } as CSSProperties} key={mode}>
            <span>{MODE_ICONS[mode]}</span>
            <i />
          </div>
        ))}
      </div>
      <div className="search-progress" aria-label={`${steps[activeStep]}, шаг ${activeStep + 1} из ${steps.length}`}>
        <div className="search-progress-track"><i style={{ width: `${[34, 68, 100][activeStep]}%` }} /></div>
        <small>{activeStep + 1} из {steps.length}</small>
      </div>
    </section>
  );
}

function BudgetInput({ value, error, onChange }: { value: string; error?: string; onChange: (value: string) => void }) {
  const [isFocused, setIsFocused] = useState(false);
  const formatted = value
    ? new Intl.NumberFormat("ru-RU").format(Number(value)).replace(/\s/g, " ")
    : "";

  return (
    <label className="field budget-field" htmlFor="budget">
      <span className="field-label">Бюджет</span>
      <div className="budget-control">
        <input
          id="budget"
          className="budget-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Без ограничений"
          value={isFocused ? value : formatted}
          aria-invalid={Boolean(error)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 9))}
        />
        <span aria-hidden="true">₽</span>
      </div>
      <FieldError id="budget-error" message={error} />
    </label>
  );
}

function TripSummary({ place, form, onEdit }: { place: PlaceOption; form: FormState; onEdit?: () => void }) {
  return (
    <section className="trip-summary" aria-label="Введённые данные">
      <div className="summary-route">
        <div><span>Откуда</span><strong>{place.name}</strong></div>
        <div className="summary-arrow" aria-hidden="true">→</div>
        <div><span>Куда</span><strong>{form.destinationCity}</strong></div>
      </div>
      <div className="summary-deadline"><span>Дедлайн</span><strong>{formatDateTime(form.arrivalDeadline)}</strong></div>
      {onEdit && <button type="button" onClick={onEdit}>Изменить</button>}
    </section>
  );
}

function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span className="field-label">{label}</span>
      {children}
      <FieldError id={`${htmlFor}-error`} message={error} />
    </label>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <span className="field-error" id={id}>{message}</span>;
}

function ResultsScreen({
  response,
  form,
  place,
  onEditRoute,
  onEditPreferences,
}: {
  response: SearchResponse;
  form: FormState;
  place: PlaceOption;
  onEditRoute: () => void;
  onEditPreferences: () => void;
}) {
  return (
    <main className="flow-screen results-screen">
      <div className="result-controls">
        <button className="back-button" type="button" onClick={onEditPreferences}>← Изменить параметры</button>
        <button className="text-button" type="button" onClick={onEditRoute}>Изменить маршрут</button>
      </div>
      <TripSummary place={place} form={form} />

      <div className="results-heading">
        <div><h1>{response.options.length ? "Вы успеваете" : "До дедлайна не успеем"}</h1></div>
      </div>

      {response.options.length > 0 ? (
        <div className="result-list">
          {response.options.map((option, index) => (
            <ResultCard option={option} currentPlaceId={place.id} index={index} key={option.id} />
          ))}
        </div>
      ) : (
        <EmptyState response={response} form={form} place={place} onEdit={onEditPreferences} />
      )}
    </main>
  );
}

function ResultCard({
  option,
  currentPlaceId,
  index,
}: {
  option: RescueOption;
  currentPlaceId: string;
  index: number;
}) {
  const smallMargin = option.deadlineMarginMinutes <= 60;
  const startsElsewhere = option.segments[0]?.fromPlaceId !== currentPlaceId;
  const travelDurationMinutes = Math.max(
    0,
    Math.round((Date.parse(option.arrivalAt) - Date.parse(option.departureAt)) / 60_000),
  );
  const transport = Array.from(new Set(option.segments.map((segment) => MODE_LABELS[segment.mode]))).join(" + ");
  const route = option.segments.map((segment) => `${segment.fromStation} → ${segment.toStation}`).join(" · ");
  const operators = Array.from(new Set(option.segments.map((segment) =>
    [segment.vehicleName || segment.carrier, segment.voyageNumber].filter(Boolean).join(" "),
  ))).join(" · ");
  const fareDetails = [
    option.fareName,
    option.luggageSummary,
    option.seatsLeft ? `Мест: ${option.seatsLeft}` : undefined,
  ].filter(Boolean).join(" · ");
  const transferLabel = option.transferCount === 0
    ? "Без пересадок"
    : `${option.transferCount} ${option.transferCount === 1 ? "пересадка" : "пересадки"}`;

  return (
    <article
      className={`result-card${smallMargin ? " result-card-risk" : ""}`}
      style={{ animationDelay: `${index * 110}ms` }}
    >
      <div className="result-card-top">
        <span className="result-transport-icon" aria-hidden="true">{MODE_ICONS[option.segments[0]?.mode ?? "plane"]}</span>
        <span className="result-category">{CATEGORY_LABELS[option.category]}</span>
        <span className="transport-label">{transport}</span>
        <small className="result-operator">{operators}</small>
      </div>

      <div className="result-timeline">
        <div><time>{formatTime(option.departureAt)}</time><small>{formatDay(option.departureAt)}</small><span>{option.segments[0]?.fromStation}</span></div>
        <div className="timeline-line"><span aria-label="Продолжительность пути">{formatDuration(travelDurationMinutes)}</span><i /><b>{transferLabel}</b></div>
        <div><time>{formatTime(option.arrivalAt)}</time><small>{formatDay(option.arrivalAt)}</small><span>{option.segments.at(-1)?.toStation}</span></div>
      </div>

      <div className="result-metrics">
        <div><span>Прибытие</span><strong>{formatDateTime(option.arrivalAt)}</strong></div>
        <div className={smallMargin ? "metric-risk" : ""}><span>Запас до дедлайна</span><strong>{formatDuration(option.deadlineMarginMinutes)}</strong></div>
      </div>

      <p className="route-description">{route}</p>
      {fareDetails && <p className="fare-copy">▣ {fareDetails}</p>}

      <div className="result-buy">
        <div><span>{option.priceIsFrom ? "Цена от" : "Цена"}</span><strong>{option.totalPrice > 0 ? formatMoney(option.totalPrice, option.currency) : "Уточняется"}</strong></div>
        <TicketButton option={option} />
      </div>

      <div className="result-warnings">
        {startsElsewhere && <p><strong>Отправление из другой точки:</strong> {option.segments[0]?.fromStation}. Дорога до неё не учтена</p>}
        <p>Перед покупкой проверьте расписание и наличие мест</p>
      </div>
    </article>
  );
}

function TicketButton({ option }: { option: RescueOption }) {
  if (option.checkoutRef) {
    return (
      <form className="ticket-action" action="/api/checkout" method="post" target="_blank" rel="noopener noreferrer">
        <input type="hidden" name="checkoutRef" value={JSON.stringify(option.checkoutRef)} />
        <button className="primary-button ticket-button" type="submit">Перейти</button>
      </form>
    );
  }

  if (option.bookingUrl) {
    return <a className="primary-button ticket-button" href={option.bookingUrl} target="_blank" rel="noreferrer">Перейти</a>;
  }

  return <span className="ticket-unavailable">Ссылка недоступна</span>;
}

function EmptyState({
  response,
  form,
  place,
  onEdit,
}: {
  response: SearchResponse;
  form: FormState;
  place: PlaceOption;
  onEdit: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-main">
        <span className="empty-icon" aria-hidden="true">×</span>
        <h2>Успеть не получится</h2>
        <p>Не нашли билетов из точки «{place.name}» в город «{form.destinationCity}» до {formatDateTime(form.arrivalDeadline)}</p>
        <button className="secondary-button" type="button" onClick={onEdit}>Изменить параметры</button>
      </div>

      {response.nearestAfterDeadline && (
        <div className="late-option">
          <span>Ближайший после дедлайна</span>
          <strong>{formatTime(response.nearestAfterDeadline.departureAt)} → {formatTime(response.nearestAfterDeadline.arrivalAt)}</strong>
          <p>{response.nearestAfterDeadline.segments[0]?.fromStation} → {response.nearestAfterDeadline.segments.at(-1)?.toStation}</p>
          <b>Опоздает на {formatDuration(response.nearestAfterDeadline.missedDeadlineByMinutes)}</b>
        </div>
      )}
    </div>
  );
}

function SupportScreen({
  form,
  place,
  support,
  supportError,
  isLoading,
  onField,
  onBack,
  onSubmit,
}: {
  form: FormState;
  place?: PlaceOption;
  support: SearchResponse["support"] | null;
  supportError: string | null;
  isLoading: boolean;
  onField: <Key extends keyof FormState>(key: Key, value: FormState[Key]) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  useEffect(() => {
    if (place) trackSupportEvent("support_block_viewed", { locationId: place.id });
  }, [place]);

  return (
    <main className="flow-screen support-screen">
      <button className="back-button" type="button" onClick={onBack}>← Закрыть помощь</button>
      <section className="page-heading compact-heading">
        <h1>Помощь с рейсом</h1>
        <p>Укажите, где вы сейчас, авиакомпанию и продавца — соберём контакты и короткий план действий</p>
      </section>

      <form className="panel support-form" onSubmit={onSubmit}>
        <div className="support-form-grid">
          <SearchablePlace
            value={form.placeQuery}
            selectedId={form.placeId}
            onQueryChange={(value) => {
              onField("placeQuery", value);
              onField("placeId", "");
            }}
            onSelect={(option) => {
              onField("placeId", option.id);
              onField("placeQuery", `${option.city}, ${option.name}`);
            }}
          />
          <Field label="Авиакомпания" htmlFor="airline">
            <select id="airline" value={form.airlineId} onChange={(event) => onField("airlineId", event.target.value)}>
              <option value="">Не знаю</option>
              {AIRLINE_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}
            </select>
          </Field>
          <Field label="Где куплен билет" htmlFor="seller">
            <select id="seller" value={form.sellerId} onChange={(event) => onField("sellerId", event.target.value)}>
              <option value="">Не помню</option>
              {SELLER_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}
            </select>
          </Field>
        </div>

        {supportError && <div className="inline-error" role="alert">{supportError}</div>}
        <div className="form-actions support-actions">
          <button className="primary-button compact-button" type="submit" disabled={isLoading}>{isLoading ? "Проверяем" : "Показать план"}</button>
        </div>
      </form>

      {support && (
        <div className="support-results" aria-live="polite">
          <section className="support-actions-panel" aria-labelledby="support-actions-title">
            <div className="support-results-heading">
              <div><h2 id="support-actions-title">Ваш план действий</h2>{support.departureTime && <p>Исходный вылет: <strong>{support.departureTime}</strong></p>}</div>
            </div>
            {support.actions.length > 0 ? (
              <>
                <ol className="support-action-list">
                  {support.actions.map((action, index) => <SupportActionItem action={action} number={index + 1} key={action.id} />)}
                </ol>
                <div className="support-prep">
                  <strong>Подготовьте перед обращением</strong>
                  <p>Номер брони или заказа, ФИО пассажира, маршрут и дату, уведомление об отмене или переносе и желаемый вариант: обмен или возврат</p>
                </div>
              </>
            ) : (
              <div className="no-contacts"><p>Проверенных ссылок пока нет</p><span>Уточните авиакомпанию или обратитесь на стойку информации</span></div>
            )}
          </section>

          {!form.sellerId && (
            <p className="seller-hint">Не помните продавца? Проверьте письмо с билетом или приложение, где оформляли заказ</p>
          )}
        </div>
      )}
    </main>
  );
}

function SupportActionItem({ action, number }: { action: SupportAction; number: number }) {
  return (
    <li className="support-action-item">
      <span className="support-action-number">{number}</span>
      <div className="support-action-copy">
        <h3>{action.title}</h3>
        <p>{withoutTerminalPeriod(action.description)}</p>
        {action.contacts.length > 0 && (
          <div className="support-contact-list">
            {action.contacts.map((contact) => (
              <a href={contact.href} key={`${contact.type}-${contact.value}`}>
                <span>{contact.label}</span>{contact.value}
              </a>
            ))}
          </div>
        )}
        {action.contactNote && <small className="support-contact-note">{withoutTerminalPeriod(action.contactNote)}</small>}
      </div>
      <a
        className="primary-button support-action-link"
        href={action.url}
        target="_blank"
        rel="noreferrer"
        onClick={() => trackSupportEvent("support_action_clicked", {
          action: action.category,
          entityType: action.entityType,
          entityId: action.entityId,
        })}
      >
        {action.actionLabel}
      </a>
    </li>
  );
}
