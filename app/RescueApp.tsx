"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  RescueOption,
  RescueSearchRequest,
  ResultCategory,
  SearchResponse,
  TransportMode,
} from "../lib/domain";

type Screen = "route" | "preferences" | "results" | "support";
type PlaceOption = RescueSearchRequest["incident"]["currentPlace"];
type Baggage = "none" | "carry_on" | "checked";
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

type FormState = {
  placeId: string;
  customPlaceName: string;
  customPlaceCity: string;
  customPlaceType: "airport" | "station";
  destinationCity: string;
  arrivalDeadline: string;
  passengers: number;
  baggage: Baggage;
  modes: TransportMode[];
  maxPrice: string;
  disruptionType: "cancelled" | "delayed";
  flightNumber: string;
  airlineId: string;
  sellerId: string;
};

const EMPTY_FORM: FormState = {
  placeId: "",
  customPlaceName: "",
  customPlaceCity: "",
  customPlaceType: "airport",
  destinationCity: "",
  arrivalDeadline: "",
  passengers: 1,
  baggage: "carry_on",
  modes: ALL_MODES,
  maxPrice: "",
  disruptionType: "delayed",
  flightNumber: "",
  airlineId: "",
  sellerId: "",
};

const SEARCH_FIELDS = new Set<keyof FormState>([
  "placeId",
  "customPlaceName",
  "customPlaceCity",
  "customPlaceType",
  "destinationCity",
  "arrivalDeadline",
  "passengers",
  "baggage",
  "modes",
  "maxPrice",
]);

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

function validateRoute(form: FormState) {
  const errors: FieldErrors = {};
  const place = getPlace(form);

  if (!form.placeId) errors.placeId = "Выберите аэропорт или вокзал";
  if (form.placeId === "custom" && !form.customPlaceName.trim()) {
    errors.customPlaceName = "Укажите название точки";
  }
  if (form.placeId === "custom" && !form.customPlaceCity.trim()) {
    errors.customPlaceCity = "Укажите город";
  }
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
  if (!Number.isInteger(form.passengers) || form.passengers < 1 || form.passengers > 9) {
    errors.passengers = "От 1 до 9 пассажиров";
  }
  if (form.maxPrice && Number(form.maxPrice) <= 0) {
    errors.maxPrice = "Укажите сумму больше нуля";
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
          flightNumber: form.flightNumber.trim() || undefined,
          airlineId: form.airlineId || undefined,
          sellerId: form.sellerId || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Не удалось загрузить контакты");
      setSupport(payload as SearchResponse["support"]);
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
        <span className="header-promise">Все идет по плану?</span>
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
        <h1>Куда нужно успеть?</h1>
        <p>Укажите три вещи — детали поездки спросим дальше.</p>
      </section>

      <form id="route-form" className="panel route-form" onSubmit={onSubmit} noValidate>
        <div className="route-fields">
          <Field label="Где вы сейчас" error={fieldErrors.placeId} htmlFor="place">
            <select
              id="place"
              value={form.placeId}
              aria-invalid={Boolean(fieldErrors.placeId)}
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
              onChange={(event) => onField("destinationCity", event.target.value)}
            />
            <datalist id="cities"><option value="Москва" /><option value="Санкт-Петербург" /><option value="Сочи" /><option value="Казань" /></datalist>
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

        {form.placeId === "custom" && (
          <div className="custom-place-fields">
            <Field label="Название точки" error={fieldErrors.customPlaceName} htmlFor="custom-place">
              <input id="custom-place" value={form.customPlaceName} onChange={(event) => onField("customPlaceName", event.target.value)} />
            </Field>
            <Field label="Город" error={fieldErrors.customPlaceCity} htmlFor="custom-city">
              <input id="custom-city" value={form.customPlaceCity} onChange={(event) => onField("customPlaceCity", event.target.value)} />
            </Field>
          </div>
        )}

        <div className="form-actions">
          <span>Шаг 1 из 4</span>
          <button className="primary-button compact-button" type="submit">Продолжить</button>
        </div>
      </form>
    </main>
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
          <div className="field preference-wide">
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

          <Field label="Пассажиров" error={fieldErrors.passengers} htmlFor="passengers">
            <select id="passengers" value={form.passengers} onChange={(event) => onField("passengers", Number(event.target.value))}>
              {Array.from({ length: 9 }, (_, index) => index + 1).map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </Field>

          <Field label="Бюджет на всех" error={fieldErrors.maxPrice} htmlFor="budget">
            <div className="input-suffix"><input id="budget" type="number" min="1" placeholder="Без ограничений" value={form.maxPrice} onChange={(event) => onField("maxPrice", event.target.value)} /><b>₽</b></div>
          </Field>

          <div className="field preference-wide">
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
      <div><span>Откуда</span><strong>{place.name}</strong></div>
      <div className="summary-arrow" aria-hidden="true">→</div>
      <div><span>Куда</span><strong>{form.destinationCity}</strong></div>
      <div><span>Дедлайн</span><strong>{formatDateTime(form.arrivalDeadline)}</strong></div>
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
        <div><h1>{response.options.length ? "Вот как можно успеть" : "До дедлайна вариантов нет"}</h1><p>{response.options.length ? "Показываем только билеты, которые прибывают вовремя." : "Не будем предлагать маршрут, с которым вы опоздаете."}</p></div>
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
        <p>{smallMargin ? "Будете всего за" : "Будете за"}<strong>{formatDuration(option.deadlineMarginMinutes)}</strong><small>до дедлайна</small></p>
      </div>

      <div className="result-buy">
        <div><span>Цена за всех</span><strong>{option.totalPrice > 0 ? formatMoney(option.totalPrice) : "Уточняется"}</strong>{option.seatsLeft ? <small>Мест: {option.seatsLeft}</small> : null}</div>
        <a className={emphasized ? "primary-button ticket-button" : "secondary-button ticket-button"} href={option.bookingUrl} target="_blank" rel="noreferrer">Открыть билет</a>
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
  return (
    <main className="flow-screen support-screen">
      <button className="back-button" type="button" onClick={onBack}>← Вернуться к вариантам</button>
      <section className="page-heading compact-heading">
        <h1>Помощь с рейсом</h1>
        <p>Расскажите, что случилось, — покажем контакты и первые шаги.</p>
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
            <select id="airline" value={form.airlineId} onChange={(event) => onField("airlineId", event.target.value)}><option value="">Не знаю</option><option value="aeroflot">Аэрофлот</option></select>
          </Field>
          <Field label="Где куплен билет" htmlFor="seller">
            <select id="seller" value={form.sellerId} onChange={(event) => onField("sellerId", event.target.value)}><option value="">Не знаю</option><option value="tutu">Туту</option></select>
          </Field>
          <Field label="Номер рейса" htmlFor="flight-number">
            <input id="flight-number" placeholder="Например, SU 15" value={form.flightNumber} onChange={(event) => onField("flightNumber", event.target.value)} />
          </Field>
          <div className="support-place"><span>Вы сейчас</span><strong>{place.name}</strong></div>
        </div>

        {supportError && <div className="inline-error" role="alert">{supportError}</div>}
        <div className="form-actions support-actions">
          <span>Не знаете данные? Покажем то, что уже известно.</span>
          <button className="primary-button compact-button" type="submit" disabled={isLoading}>{isLoading ? "Загружаем" : "Что делать"}</button>
        </div>
      </form>

      {support && (
        <div className="support-results" aria-live="polite">
          <section className="contacts-panel" aria-labelledby="contacts-title">
            <h2 id="contacts-title">Кому обратиться</h2>
            {support.contacts.length > 0 ? (
              <div className="contact-list">
                {support.contacts.map((contact) => (
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
              <div className="no-contacts"><p>Точных контактов пока нет.</p><span>Обратитесь на стойку информации в аэропорту или добавьте авиакомпанию.</span></div>
            )}
          </section>

          <section className="action-plan" aria-labelledby="plan-title">
            <h2 id="plan-title">Что сделать сейчас</h2>
            <ol>{support.actionPlan.map((item, index) => <li key={item}><span>{index + 1}</span><p>{item}</p></li>)}</ol>
          </section>
        </div>
      )}
    </main>
  );
}
