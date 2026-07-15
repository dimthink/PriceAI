import { authRequiredResponse, getCurrentUser } from "@/lib/auth";
import { buildAccountDataExport } from "@/lib/account-data";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { accountApiErrorResponse } from "@/lib/account-api-errors";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return authRequiredResponse();

  try {
    const data = await buildAccountDataExport(user);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        ...noStoreCacheHeaders(),
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="priceai-account-export-${date}.json"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return accountApiErrorResponse(error, "账户数据导出暂时不可用，请稍后再试。");
  }
}
