import { getTravelProvider } from "../../../lib/providers";
import { TutuMcpError } from "../../../lib/providers/tutu-mcp-client";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const checkoutRef = body?.checkoutRef;

  if (
    typeof checkoutRef !== "object" ||
    checkoutRef === null ||
    Array.isArray(checkoutRef)
  ) {
    return Response.json({ error: "Не выбран конкретный билет" }, { status: 400 });
  }

  const provider = getTravelProvider();
  if (!provider.createCheckoutLink) {
    return Response.json(
      { error: "Оформление для этого источника недоступно" },
      { status: 409 },
    );
  }

  try {
    const checkout = await provider.createCheckoutLink(checkoutRef);
    return Response.json(checkout);
  } catch (error) {
    if (error instanceof TutuMcpError) {
      return Response.json(
        { error: "Не удалось открыть выбранный билет", detail: error.message },
        { status: 502 },
      );
    }
    throw error;
  }
}
