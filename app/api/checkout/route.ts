import { checkoutRequestSchema } from "../../../lib/domain";
import { createTutuCheckoutLink } from "../../../lib/providers/tutu-mcp-provider";

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
    return Response.json({ error: "Не удалось определить выбранный билет" }, { status: 400 });
  }

  try {
    const checkout = await createTutuCheckoutLink(parsed.data.checkoutRef);
    return isFormRequest
      ? Response.redirect(checkout.checkoutUrl, 303)
      : Response.json(checkout);
  } catch {
    return Response.json(
      { error: "Не удалось открыть билет, повторите попытку" },
      { status: 502 },
    );
  }
}
