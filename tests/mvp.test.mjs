import assert from "node:assert/strict";
import test from "node:test";

let workerPromise;
let mcpShouldFail = false;
const mcpRequests = [];
const tutuMcpUrl = "https://mcp.tutu.ru/mcp";

const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url =
    typeof input === "string" ? input : input instanceof Request ? input.url : input.url;

  if (url !== tutuMcpUrl) {
    return nativeFetch(input, init);
  }

  const payload = JSON.parse(String(init?.body ?? ""));
  mcpRequests.push(payload);

  if (payload.method === "initialize") {
    return Response.json({
      jsonrpc: "2.0",
      id: payload.id,
      result: { protocolVersion: "2025-03-26" },
    });
  }

  if (payload.method === "notifications/initialized") {
    return new Response(null, { status: 202 });
  }

  if (payload.method === "tools/call") {
    if (mcpShouldFail) {
      return Response.json({
        jsonrpc: "2.0",
        id: payload.id,
        result: {
          isError: true,
          content: [{ type: "text", text: "upstream unavailable" }],
        },
      });
    }

    const content = payload.params.name === "create_checkout_link"
      ? {
          checkout_url: `https://www.tutu.ru/checkout/${payload.params.arguments.offer_hash}`,
          kind: "deeplink",
        }
      : {
          offers: tutuOffers(payload.params.name),
        };

    return Response.json({
      jsonrpc: "2.0",
      id: payload.id,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify(content),
          },
        ],
      },
    });
  }

  throw new Error(`Unexpected MCP request: ${payload.method}`);
};

function tutuOffers(toolName) {
  const offersByTool = {
    search_avia: [
      tutuOffer({
        id: "plane-fast",
        transport: "avia",
        from: "Санкт-Петербург — Пулково (LED)",
        to: "Москва — Шереметьево (SVO)",
        departureAt: "2026-08-19T07:15:00.000Z",
        arrivalAt: "2026-08-19T08:50:00.000Z",
        price: 12480,
        carrier: "Аэрофлот",
      }),
      tutuOffer({
        id: "plane-value",
        transport: "avia",
        from: "Санкт-Петербург — Пулково (LED)",
        to: "Москва — Внуково (VKO)",
        departureAt: "2026-08-19T09:00:00.000Z",
        arrivalAt: "2026-08-19T10:40:00.000Z",
        price: 9870,
        carrier: "Победа",
      }),
    ],
    search_rail: [
      tutuOffer({
        id: "train",
        transport: "railway",
        from: "Санкт-Петербург — Московский вокзал (2004001)",
        to: "Москва — Ленинградский вокзал (2006004)",
        departureAt: "2026-08-19T08:00:00.000Z",
        arrivalAt: "2026-08-19T12:05:00.000Z",
        price: 6940,
        carrier: "РЖД",
      }),
    ],
    search_bus: [
      tutuOffer({
        id: "bus-late",
        transport: "bus",
        from: "Автовокзал Санкт-Петербург",
        to: "Автовокзал Москва",
        departureAt: "2026-08-19T07:30:00.000Z",
        arrivalAt: "2026-08-19T17:30:00.000Z",
        price: 3200,
        carrier: "Автобусный перевозчик",
      }),
    ],
    search_etrain: [],
  };

  return offersByTool[toolName] ?? [];
}

function tutuOffer({
  id,
  transport,
  from,
  to,
  departureAt,
  arrivalAt,
  price,
  carrier,
}) {
  return {
    offer_id: id,
    transport,
    price: { amount: price, currency: "RUB" },
    departure_at: departureAt,
    arrival_at: arrivalAt,
    checkout_url: `https://www.tutu.ru/checkout/${id}`,
    search_results_url: "https://www.tutu.ru/",
    checkout_ref: { transport, offer_hash: id },
    variants: transport === "avia"
      ? [{ conditions: { baggage: { kg: 10, pieces: 1 } } }]
      : [],
    carriers: [carrier],
    legs: [
      {
        segments: [
          {
            from,
            to,
            departure_at: departureAt,
            arrival_at: arrivalAt,
            carrier,
            voyage_no: `${transport}-${id}`,
            from_geo_point_id: `${id}-from`,
          },
        ],
      },
    ],
  };
}

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

function demoRequest(overrides = {}) {
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
  assert.match(html, /Если рейс сорвался/);
  assert.match(html, /Куда нужно успеть/);
  assert.match(html, /Отправление — с текущего момента/);
  assert.doesNotMatch(html, /react-loading-skeleton|Your site is taking shape/);
});

test("control case returns three unique options that meet the deadline", async () => {
  const { response, body } = await search(demoRequest());
  assert.equal(response.status, 200);
  assert.equal(body.dataSource, "tutu-mcp");
  assert.equal(body.currentJourneyStatus, "unknown");
  assert.equal(body.options.length, 2);
  assert.equal(new Set(body.options.map((option) => option.id)).size, 2);

  const readyFrom = Date.parse("2026-08-19T06:00:00.000Z");
  const deadline = Date.parse("2026-08-19T15:00:00.000Z");
  for (const option of body.options) {
    assert.ok(Date.parse(option.departureAt) >= readyFrom);
    assert.ok(Date.parse(option.arrivalAt) <= deadline);
    assert.ok(option.deadlineMarginMinutes >= 0);
  }

  assert.deepEqual(
    body.options.map((option) => option.category),
    ["fastest", "cheapest"],
  );

  const searchCall = mcpRequests.find(
    (request) =>
      request.method === "tools/call" &&
      request.params.name === "search_avia",
  );
  assert.deepEqual(searchCall.params.arguments, {
    origin: "Санкт-Петербург",
    destination: "Москва",
    departure_date: "2026-08-19",
    page_size: 30,
    sort: "departure_asc",
    view: "compact",
    direct_only: false,
    adults: 1,
  });
});

test("does not invent an option when the deadline is impossible", async () => {
  const { response, body } = await search(
    demoRequest({
      destination: { arrivalDeadline: "2026-08-19T06:30:00.000Z" },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(body.options, []);
  assert.equal(body.rejectedCount, 4);
});

test("creates a unique Tutu checkout link for the chosen offer", async () => {
  const response = await request("/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      checkoutRef: { transport: "avia", offer_hash: "plane-fast" },
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.url, "https://www.tutu.ru/checkout/plane-fast");
  assert.equal(body.kind, "deeplink");
  assert.ok(
    mcpRequests.some(
      (request) =>
        request.method === "tools/call" &&
        request.params.name === "create_checkout_link" &&
        request.params.arguments.offer_hash === "plane-fast",
    ),
  );
});

test("strict origin excludes tickets from another station", async () => {
  const { body } = await search(
    demoRequest({ departure: { allowOtherPlaces: false } }),
  );
  assert.ok(body.options.length > 0);
  assert.ok(
    body.options.every(
      (option) => option.segments[0].fromPlaceId === "pulkovo",
    ),
  );
});

test("delayed flight stays unknown without a verified arrival time", async () => {
  const { body } = await search(
    demoRequest({
      incident: {
        newDeparture: "2026-08-19T12:00:00.000Z",
      },
    }),
  );
  assert.equal(body.currentJourneyStatus, "unknown");
});

test("rejects search when ready time is not before the deadline", async () => {
  const { response, body } = await search(
    demoRequest({ departure: { readyFrom: "2026-08-19T15:00:00.000Z" } }),
  );
  assert.equal(response.status, 400);
  assert.match(body.issues[0].message, /Дедлайн/);
});

test("returns a source error instead of an empty search when Tutu MCP fails", async () => {
  mcpShouldFail = true;

  try {
    const { response, body } = await search(demoRequest());
    assert.equal(response.status, 502);
    assert.match(body.error, /Источник Туту/);
    assert.match(body.detail, /upstream unavailable/);
  } finally {
    mcpShouldFail = false;
  }
});
