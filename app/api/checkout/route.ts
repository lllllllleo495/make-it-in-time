import { checkoutRequestSchema } from "../../../lib/domain";
import { createTutuCheckoutLink } from "../../../lib/providers/tutu-mcp-provider";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = checkoutRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Не удалось определить выбранный билет" }, { status: 400 });
  }

  try {
    return Response.json(await createTutuCheckoutLink(parsed.data.checkoutRef));
  } catch {
    return Response.json(
      { error: "Не удалось открыть билет. Повторите попытку." },
      { status: 502 },
    );
  }
}
