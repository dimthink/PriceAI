const DEFAULT_DETECTOR_TIMEOUT_MS = 15_000;
const DEFAULT_DETECTOR_RESPONSE_BYTES = 512 * 1024;

export type DetectorJsonResponse<T> = {
  response: Response;
  data: T;
};

export function normalizeDetectorServiceUrl(value: string | null | undefined): string {
  if (!value) throw new Error("检测服务未配置。");

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("检测服务地址格式不正确。");
  }

  if (!isHttpProtocol(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("检测服务地址格式不正确。");
  }

  return url.toString().replace(/\/$/, "");
}

export function resolveDetectorStatusUrl(serviceUrl: string, candidate: string): string {
  const base = new URL(normalizeDetectorServiceUrl(serviceUrl));
  let resolved: URL;
  try {
    resolved = new URL(candidate, base);
  } catch {
    throw new Error("检测服务返回了无效的任务状态地址。");
  }

  if (
    !isHttpProtocol(resolved.protocol) ||
    resolved.origin !== base.origin ||
    resolved.username ||
    resolved.password ||
    resolved.hash ||
    !/^\/api\/status\/[A-Za-z0-9._~-]+$/.test(resolved.pathname)
  ) {
    throw new Error("检测服务返回了不受信任的任务状态地址。");
  }

  return resolved.toString();
}

export async function fetchDetectorJson<T>(
  input: string,
  init: RequestInit = {},
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<DetectorJsonResponse<T>> {
  const timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_DETECTOR_TIMEOUT_MS);
  const maxBytes = positiveInteger(options.maxBytes, DEFAULT_DETECTOR_RESPONSE_BYTES);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("detector_timeout")), timeoutMs);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
      throw new Error("检测服务响应过大。");
    }

    const bytes = await readLimitedResponseBytes(response, maxBytes);

    let data = {} as T;
    if (bytes.byteLength) {
      try {
        data = JSON.parse(new TextDecoder().decode(bytes)) as T;
      } catch {
        throw new Error("检测服务返回了无法解析的响应。");
      }
    }

    return { response, data };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("检测服务响应超时。");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimitedResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error("检测服务响应过大。");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isHttpProtocol(protocol: string): boolean {
  return protocol === "https:" || protocol === "http:";
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}
