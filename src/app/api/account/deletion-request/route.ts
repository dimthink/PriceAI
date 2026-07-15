import { authRequiredResponse, getCurrentUser } from "@/lib/auth";
import {
  cancelAccountDeletionRequest,
  createAccountDeletionRequest,
  getActiveAccountDeletionRequest,
} from "@/lib/account-data";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { isSameOriginMutation, sameOriginRequiredResponse } from "@/lib/request-origin";
import { accountApiErrorResponse } from "@/lib/account-api-errors";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return authRequiredResponse();
  try {
    const request = await getActiveAccountDeletionRequest(user.id);
    return Response.json({ ok: true, request }, { headers: noStoreCacheHeaders() });
  } catch (error) {
    return accountApiErrorResponse(error, "账号删除申请服务暂时不可用，请稍后再试。");
  }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return sameOriginRequiredResponse();
  const user = await getCurrentUser();
  if (!user) return authRequiredResponse();
  try {
    const deletionRequest = await createAccountDeletionRequest(user);
    return Response.json({ ok: true, request: deletionRequest }, { status: 201, headers: noStoreCacheHeaders() });
  } catch (error) {
    return accountApiErrorResponse(error, "账号删除申请服务暂时不可用，请稍后再试。");
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginMutation(request)) return sameOriginRequiredResponse();
  const user = await getCurrentUser();
  if (!user) return authRequiredResponse();
  try {
    await cancelAccountDeletionRequest(user.id);
    return Response.json({ ok: true, request: null }, { headers: noStoreCacheHeaders() });
  } catch (error) {
    return accountApiErrorResponse(error, "账号删除申请服务暂时不可用，请稍后再试。");
  }
}
