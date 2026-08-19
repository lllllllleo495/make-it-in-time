"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
type PlaceOption = RescueSearchRequest["incident"]["currentPlace"];
type PlaceSearchOption = PlaceOption & { code: string; aliases: string[] };
type Baggage = "none" | "carry_on" | "checked";
type FieldErrors = Partial<Record<keyof FormState, string>>;

const PLACE_OPTIONS: PlaceSearchOption[] = supportData.locations.map((location) => ({
  id: location.id,
  name: location.name,
  city: location.city,
  type: location.type === "airport" ? "airport" : "station",
  code: location.code,
  aliases: location.aliases,
}));

const AIRLINE_OPTIONS = supportData.airlines.map(({ id, name }) => ({ id, name }));
const SELLER_OPTIONS = supportData.sellers.map(({ id, name }) => ({ id, name }));
const CITY_OPTIONS = Array.from(new Set(PLACE_OPTIONS.map((place) => place.city)));

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

type FormState = {
  placeId: string;
  placeQuery: string;
  destinationCity: string;
  arrivalDeadline: string;
  passengers: number;
  baggage: Baggage;
  modes: TransportMode[];
  maxPrice: string;
  disruptionType: "cancelled" | "delayed";
  departureTime: string;
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
  disruptionType: "delayed",
  departureTime: "",
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
  "disruptionType",
  "departureTime",
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

function formatDay(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function formatPassengerCount(value: number) {
  if (value === 1) return "1 пассажир";
  if (value >= 2 && value <= 4) return `${value} пассажира`;
  return `${value} пассажиров`;
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
      setResult(payload as SearchResponse);
      setScreen("results");
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
    if (!place || isSupportLoading) return;
    setSupportError(null);
    setIsSupportLoading(true);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPlaceId: place.id,
          disruptionType: form.disruptionType,
          departureTime: form.departureTime || undefined,
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

  return (
    <div className="app-shell">
      <AppHeader
        screen={screen}
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
          onSupport={() => setScreen("support")}
        />
      )}

      {screen === "support" && place && (
        <SupportScreen
          form={form}
          place={place}
          support={support}
          supportError={supportError}
          isLoading={isSupportLoading}
          onField={setField}
          onBack={() => setScreen(result ? "results" : "route")}
          onSubmit={loadSupport}
        />
      )}
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
    { id: "support", label: "Помощь" },
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
            const canOpen = step.id === "route" || (step.id === "preferences" && canOpenPreferences) || (step.id === "results" && hasResults) || (step.id === "support" && hasResults);
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
        <h1>Поможем успеть</h1>
        <p>Укажите важное — детали уточним далее.</p>
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

          <Field label="Куда нужно попасть" error={fieldErrors.destinationCity} htmlFor="destination">
            <input
              id="destination"
              list="cities"
              type="text"
              placeholder="Например, Москва"
              value={form.destinationCity}
              aria-invalid={Boolean(fieldErrors.destinationCity)}
              onChange={(event) => onField("destinationCity", event.target.value)}
            />
            <datalist id="cities">{CITY_OPTIONS.map((city) => <option value={city} key={city} />)}</datalist>
          </Field>

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
          <span>Шаг 1 из 4</span>
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
      {isOpen && (
        <div className="place-options" id="place-options" role="listbox">
          {filtered.length > 0 ? filtered.map((option) => (
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
          )) : (
            <p>Такой точки нет в справочнике. Можно продолжить со своим названием.</p>
          )}
        </div>
      )}
      <FieldError id="place-search-error" message={error} />
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
  return (
    <main className="flow-screen preferences-screen">
      <button className="back-button" type="button" onClick={onBack}>← Изменить маршрут</button>
      <section className="page-heading compact-heading">
        <h1>Что учесть?</h1>
        <p>Выберите подходящие условия — и найдём варианты.</p>
      </section>
      <TripSummary place={place} form={form} onEdit={onBack} />

      <form id="preferences-form" className="panel preferences-form" onSubmit={onSubmit} noValidate>
        <div className="preference-grid">
          <div className="field baggage-field">
            <span className="field-label">Багаж</span>
            <div className="segmented" role="radiogroup" aria-label="Багаж">
              {([
                ["none", "Без багажа"],
                ["carry_on", "Ручная кладь"],
                ["checked", "С багажом"],
              ] as [Baggage, string][]).map(([value, label]) => (
                <label className={form.baggage === value ? "active" : ""} key={value}>
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
              <strong aria-live="polite">{formatPassengerCount(form.passengers)}</strong>
              <button type="button" aria-label="Увеличить количество пассажиров" disabled={form.passengers >= 6} onClick={() => onField("passengers", form.passengers + 1)}>+</button>
            </div>
            <FieldError id="passengers-error" message={fieldErrors.passengers} />
          </div>

          <Field label="Бюджет на всех" error={fieldErrors.maxPrice} htmlFor="budget">
            <div className="input-suffix"><input id="budget" type="number" min="500" step="500" placeholder="Без ограничений" value={form.maxPrice} onChange={(event) => onField("maxPrice", event.target.value)} /><b>₽</b></div>
          </Field>

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
  onSupport,
}: {
  response: SearchResponse;
  form: FormState;
  place: PlaceOption;
  onEditRoute: () => void;
  onEditPreferences: () => void;
  onSupport: () => void;
}) {
  return (
    <main className="flow-screen results-screen">
      <div className="result-controls">
        <button className="back-button" type="button" onClick={onEditPreferences}>← Изменить параметры</button>
        <button className="text-button" type="button" onClick={onEditRoute}>Изменить маршрут</button>
      </div>
      <TripSummary place={place} form={form} />

      <div className="results-heading">
        <div><h1>{response.options.length ? "Вот как можно успеть" : "До дедлайна не успеем"}</h1>{response.options.length > 0 && <p>Показываем только билеты, которые прибывают вовремя.</p>}</div>
        {response.options.length > 0 && <span>{response.options.length} {response.options.length === 1 ? "вариант" : "варианта"}</span>}
      </div>

      {response.options.length > 0 ? (
        <div className="result-list">
          {response.options.map((option, index) => (
            <ResultCard option={option} currentPlaceId={place.id} key={option.id} emphasized={index === 0} />
          ))}
        </div>
      ) : (
        <EmptyState response={response} form={form} place={place} onEdit={onEditPreferences} />
      )}

      <section className="support-prompt">
        <div><span aria-hidden="true">?</span><p><strong>Рейс отменили или перенесли?</strong>Подскажем, кому позвонить и что сделать дальше.</p></div>
        <button type="button" onClick={onSupport}>Получить помощь</button>
      </section>
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
  const operators = Array.from(new Set(option.segments.map((segment) =>
    [segment.vehicleName || segment.carrier, segment.voyageNumber].filter(Boolean).join(" "),
  ))).join(" · ");
  const fareDetails = [
    option.fareName,
    option.luggageSummary,
    option.seatsLeft ? `Мест: ${option.seatsLeft}` : undefined,
  ].filter(Boolean).join(" · ");

  return (
    <article className={`result-card${smallMargin ? " result-card-risk" : ""}`}>
      <div className="result-card-top">
        <span className="result-category">{CATEGORY_LABELS[option.category]}</span>
        <span className="transport-label">{transport}</span>
        {option.source === "tutu-mcp" && <span className="source-label">Туту</span>}
      </div>

      <div className="result-timeline">
        <div><time>{formatTime(option.departureAt)}</time><small>{formatDay(option.departureAt)}</small><span>{option.segments[0]?.fromStation}</span></div>
        <div className="timeline-line"><span>{option.transferCount === 0 ? "Без пересадок" : `${option.transferCount} перес.`}</span><i /></div>
        <div><time>{formatTime(option.arrivalAt)}</time><small>{formatDay(option.arrivalAt)}</small><span>{option.segments.at(-1)?.toStation}</span></div>
      </div>

      <p className="route-description"><strong>{operators}</strong>{route}</p>

      <div className={`margin-block${smallMargin ? " margin-risk" : ""}`}>
        <span aria-hidden="true">{smallMargin ? "!" : "✓"}</span>
        <p>{smallMargin ? "Будете всего за" : "Будете за"}<strong>{formatDuration(option.deadlineMarginMinutes)}</strong><small>до дедлайна</small></p>
      </div>

      <div className="result-buy">
        <div><span>{option.priceIsFrom ? "Цена от, за всех" : "Цена за всех"}</span><strong>{option.totalPrice > 0 ? formatMoney(option.totalPrice, option.currency) : "Уточняется"}</strong>{fareDetails && <small>{fareDetails}</small>}</div>
        {option.bookingUrl ? (
          <a className={emphasized ? "primary-button ticket-button" : "secondary-button ticket-button"} href={option.bookingUrl} target="_blank" rel="noreferrer">Смотреть на Туту</a>
        ) : (
          <span className="ticket-unavailable">Ссылка недоступна</span>
        )}
      </div>

      <div className="result-warnings">
        {startsElsewhere && <p><strong>Отправление из другой точки:</strong> {option.segments[0]?.fromStation}. Дорога до неё не учтена.</p>}
        <p>Перед покупкой проверьте расписание и наличие мест.</p>
      </div>
    </article>
  );
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
        <p>Не нашли билетов из точки «{place.name}» в город «{form.destinationCity}» до {formatDateTime(form.arrivalDeadline)}.</p>
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
  place: PlaceOption;
  support: SearchResponse["support"] | null;
  supportError: string | null;
  isLoading: boolean;
  onField: <Key extends keyof FormState>(key: Key, value: FormState[Key]) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  useEffect(() => {
    trackSupportEvent("support_block_viewed", { locationId: place.id });
  }, [place.id]);

  return (
    <main className="flow-screen support-screen">
      <button className="back-button" type="button" onClick={onBack}>← Вернуться к вариантам</button>
      <section className="page-heading compact-heading">
        <h1>Что делать с исходным рейсом?</h1>
        <p>Если что-то пошло не по плану, расскажите, что знаете. Покажем понятные действия и официальные ссылки.</p>
      </section>

      <form className="panel support-form" onSubmit={onSubmit}>
        <div className="support-form-grid">
          <div className="field support-wide">
            <span className="field-label">Что случилось?</span>
            <div className="segmented" role="radiogroup" aria-label="Что случилось с рейсом">
              <label className={form.disruptionType === "delayed" ? "active" : ""}><input type="radio" name="disruption" checked={form.disruptionType === "delayed"} onChange={() => onField("disruptionType", "delayed")} />Рейс перенесли</label>
              <label className={form.disruptionType === "cancelled" ? "active" : ""}><input type="radio" name="disruption" checked={form.disruptionType === "cancelled"} onChange={() => onField("disruptionType", "cancelled")} />Рейс отменили</label>
            </div>
          </div>

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
          <Field label="Исходный вылет · необязательно" htmlFor="departure-time">
            <input id="departure-time" type="time" value={form.departureTime} onChange={(event) => onField("departureTime", event.target.value)} />
          </Field>
          <div className="support-place"><span>Где вы сейчас</span><strong>{place.city}, {place.name}</strong></div>
        </div>

        {supportError && <div className="inline-error" role="alert">{supportError}</div>}
        <div className="form-actions support-actions">
          <span>Можно не знать продавца и время — это не заблокирует помощь.</span>
          <button className="primary-button compact-button" type="submit" disabled={isLoading}>{isLoading ? "Проверяем" : "Получить инструкцию"}</button>
        </div>
      </form>

      {support && (
        <div className="support-results" aria-live="polite">
          <section className="support-actions-panel" aria-labelledby="support-actions-title">
            <div className="support-results-heading">
              <div><h2 id="support-actions-title">Что сделать сейчас</h2>{support.departureTime && <p>Ваш исходный вылет: <strong>{support.departureTime}</strong></p>}</div>
              <span>{support.actions.length} из 3 действий</span>
            </div>
            {support.actions.length > 0 ? (
              <ol className="support-action-list">
                {support.actions.map((action, index) => <SupportActionItem action={action} number={index + 1} key={action.id} />)}
              </ol>
            ) : (
              <div className="no-contacts"><p>Проверенных ссылок пока нет.</p><span>Уточните авиакомпанию или обратитесь на стойку информации.</span></div>
            )}
          </section>

          {support.misses.length > 0 && (
            <div className="directory-miss">Для части данных пока нет проверенной ссылки — ничего не стали придумывать.</div>
          )}
          {!form.sellerId && (
            <p className="seller-hint">Не помните продавца? Проверьте письмо с билетом или приложение, где оформляли заказ.</p>
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
        <span>{action.entityName}</span>
        <h3>{action.title}</h3>
        <p>{action.description}</p>
        {action.verifiedAt && <small>✓ Официальная ссылка</small>}
      </div>
      <a
        className="secondary-button support-action-link"
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
