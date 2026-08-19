import { checkoutRequestSchema } from "../../../lib/domain";
import { createTutuCheckoutLink } from "../../../lib/providers/tutu-mcp-provider";
import { corsPreflight, jsonWithCors } from "../../../lib/http";

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}

function getReliableCheckoutUrl(checkoutUrl: string, checkoutRef: Record<string, unknown>) {
  const fallback = checkoutRef.search_results_url;
  if (typeof fallback !== "string") return checkoutUrl;

  try {
    const checkout = new URL(checkoutUrl);
    const search = new URL(fallback);
    const isTutuSearch = search.protocol === "https:" && (search.hostname === "tutu.ru" || search.hostname.endsWith(".tutu.ru"));
    return checkout.hostname === "mtp-deeplink.tutu.ru" && isTutuSearch ? search.toString() : checkoutUrl;
  } catch {
    return checkoutUrl;
  }
}

export async function POST(request: Request) {
  const isFormRequest = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded") ?? false;
  const body = isFormRequest
    ? await request.formData().then((formData) => {
      const checkoutRef = formData.get("checkoutRef");
      if (typeof checkoutRef !== "string") return null;
      try {
        return { checkoutRef: JSON.parse(checkoutRef) };
      } catch {
        return null;
      }
    })
    : await request.json().catch(() => null);
  const parsed = checkoutRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonWithCors(request, { error: "Не удалось определить выбранный билет" }, { status: 400 });
  }

  try {
    const checkout = await createTutuCheckoutLink(parsed.data.checkoutRef);
    return isFormRequest
      ? Response.redirect(getReliableCheckoutUrl(checkout.checkoutUrl, parsed.data.checkoutRef), 303)
      : jsonWithCors(request, checkout);
  } catch {
    return jsonWithCors(
      request,
      { error: "Не удалось открыть билет, повторите попытку" },
      { status: 502 },
    );
  }
}
