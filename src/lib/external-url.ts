export function safeExternalHttpUrl(value: string | null | undefined): string | null {
  const input = value?.trim();
  if (!input) return null;

  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
