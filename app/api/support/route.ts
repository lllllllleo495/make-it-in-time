import { getSupportBundleForIds } from "../../../data/support-providers";
import { supportRequestSchema } from "../../../lib/domain";
import { corsPreflight, jsonWithCors } from "../../../lib/http";

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = supportRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonWithCors(
      request,
      { error: "Проверьте данные о рейсе" },
      { status: 400 },
    );
  }

  return jsonWithCors(request, getSupportBundleForIds(parsed.data));
}
