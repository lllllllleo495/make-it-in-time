import assert from "node:assert/strict";
import test from "node:test";

let workerPromise;

async function getWorker() {
  workerPromise ??= import(
    new URL(`../dist/server/index.js?test=${process.pid}`, import.meta.url).href
  ).then((module) => module.default);
  return workerPromise;
}

const environment = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

async function request(path, init) {
  const worker = await getWorker();
  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    environment,
    executionContext,
  );
}

function controlRequest(overrides = {}) {
  const request = {
    incident: {
      currentPlace: {
        id: "pulkovo",
        name: "Пулково",
        city: "Санкт-Петербург",
        type: "airport",
      },
      currentTime: "2026-08-19T06:00:00.000Z",
      disruptionType: "delayed",
      scheduledDeparture: "2026-08-19T07:30:00.000Z",
      newDeparture: "2026-08-19T15:00:00.000Z",
      expectedArrival: "2026-08-19T16:30:00.000Z",
      flightNumber: "SU 15",
      airlineId: "aeroflot",
      sellerId: "tutu",
    },
    destination: {
      city: "Москва",
      arrivalDeadline: "2026-08-19T15:00:00.000Z",
    },
    departure: {
      readyFrom: "2026-08-19T06:00:00.000Z",
      allowOtherPlaces: true,
    },
    preferences: {
      passengers: 1,
      modes: ["plane", "train", "bus"],
      priority: "fastest",
      maxTransfers: 2,
    },
  };

  return {
    ...request,
    ...overrides,
    incident: { ...request.incident, ...overrides.incident },
    destination: { ...request.destination, ...overrides.destination },
    departure: { ...request.departure, ...overrides.departure },
    preferences: { ...request.preferences, ...overrides.preferences },
  };
}

async function search(payload) {
  const response = await request("/api/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { response, body: await response.json() };
}

test("server-renders the Успеть product instead of the starter", async () => {
  const response = await request("/", { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Успеть/);
  assert.match(html, /Куда нужно успеть/);
  assert.match(html, /Продолжить/);
  assert.match(html, /Все идет по плану/);
  assert.match(html, /Где вы сейчас/);
  assert.match(html, /Куда нужно попасть/);
  assert.match(html, /Быть на месте не позже/);
  assert.doesNotMatch(html, /Когда готовы отправиться/);
  assert.doesNotMatch(html, /Добраться вовремя после сбоя поездки/);
  assert.doesNotMatch(html, /2026-08-19T09:00|2026-08-19T10:30/);
  assert.doesNotMatch(html, /Демо-данные|\bMVP\b|\bMCP\b/i);
  assert.doesNotMatch(html, /react-loading-skeleton|Your site is taking shape/);
});

test("control case returns three unique options that meet the deadline", async () => {
  const { response, body } = await search(controlRequest());
  assert.equal(response.status, 200);
  assert.equal(body.dataSource, "fixture");
  assert.equal(body.currentJourneyStatus, "misses");
  assert.equal(body.options.length, 3);
  assert.equal(new Set(body.options.map((option) => option.id)).size, 3);

  const readyFrom = Date.parse("2026-08-19T06:00:00.000Z");
  const deadline = Date.parse("2026-08-19T15:00:00.000Z");
  for (const option of body.options) {
    assert.ok(Date.parse(option.departureAt) >= readyFrom);
    assert.ok(Date.parse(option.arrivalAt) <= deadline);
    assert.ok(option.deadlineMarginMinutes >= 0);
  }

  assert.deepEqual(
    body.options.map((option) => option.category),
    ["fastest", "cheapest", "fewest_transfers"],
  );
});

test("does not invent an option when the deadline is impossible", async () => {
  const { response, body } = await search(
    controlRequest({
      destination: { arrivalDeadline: "2026-08-19T06:30:00.000Z" },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(body.options, []);
  assert.equal(body.rejectedCount, 4);
  assert.equal(body.nearestAfterDeadline.id, "fixture-plane-fast");
  assert.ok(body.nearestAfterDeadline.missedDeadlineByMinutes > 0);
});

test("returns one option when only one route meets the deadline", async () => {
  const { response, body } = await search(
    controlRequest({
      destination: { arrivalDeadline: "2026-08-19T09:50:00.000Z" },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(body.options.length, 1);
  assert.equal(body.options[0].id, "fixture-plane-fast");
});

test("keeps a small positive deadline margin explicit", async () => {
  const { response, body } = await search(
    controlRequest({
      destination: { arrivalDeadline: "2026-08-19T08:55:00.000Z" },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(body.options.length, 1);
  assert.equal(body.options[0].deadlineMarginMinutes, 5);
});

test("search does not require original-flight details", async () => {
  const { response, body } = await search(
    controlRequest({
      incident: {
        scheduledDeparture: undefined,
        newDeparture: undefined,
        expectedArrival: undefined,
        flightNumber: undefined,
        airlineId: undefined,
        sellerId: undefined,
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(body.options.length, 3);
});

test("strict origin excludes tickets from another station", async () => {
  const { body } = await search(
    controlRequest({ departure: { allowOtherPlaces: false } }),
  );
  assert.ok(body.options.length > 0);
  assert.ok(
    body.options.every(
      (option) => option.segments[0].fromPlaceId === "pulkovo",
    ),
  );
});

test("current delayed flight is assessed separately when arrival is known", async () => {
  const { body } = await search(
    controlRequest({
      incident: {
        newDeparture: "2026-08-19T12:00:00.000Z",
        expectedArrival: "2026-08-19T14:00:00.000Z",
      },
    }),
  );
  assert.equal(body.currentJourneyStatus, "fits");
  assert.ok(body.options.every((option) => option.id !== "SU 15"));
});

test("rejects search when ready time is not before the deadline", async () => {
  const { response, body } = await search(
    controlRequest({ departure: { readyFrom: "2026-08-19T15:00:00.000Z" } }),
  );
  assert.equal(response.status, 400);
  assert.match(body.issues[0].message, /Дедлайн/);
});

test("support is requested separately from route search", async () => {
  const response = await request("/api/support", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      currentPlaceId: "pulkovo",
      disruptionType: "cancelled",
      airlineId: "aeroflot",
      sellerId: "tutu",
      flightNumber: "SU 15",
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(
    body.contacts.map((contact) => contact.type),
    ["airline", "airport", "seller"],
  );
  assert.match(body.actionPlan[0], /пересадить/);
});
