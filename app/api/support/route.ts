import { getSupportBundleForIds } from "../../../data/support-providers";
import { supportRequestSchema } from "../../../lib/domain";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = supportRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Проверьте данные о рейсе" },
      { status: 400 },
    );
  }

  return Response.json(getSupportBundleForIds(parsed.data));
}
