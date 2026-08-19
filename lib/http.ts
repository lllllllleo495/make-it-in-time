const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://lllllllleo495.github.io",
];

function getAllowedOrigins() {
  const configured = process.env.ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim().replace(/\/$/u, ""))
    .filter(Boolean);
  return new Set(configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin")?.replace(/\/$/u, "");
  const headers = new Headers({
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  });

  if (origin && getAllowedOrigins().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}

export function jsonWithCors(
  request: Request,
  body: unknown,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  for (const [name, value] of corsHeaders(request)) {
    headers.set(name, value);
  }
  return Response.json(body, { ...init, headers });
}

export function corsPreflight(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
