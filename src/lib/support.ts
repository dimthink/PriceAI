export const supportPagePath = "/support";
export const githubRepoUrl = "https://github.com/physics-dimension/PriceAI";
export const githubStarUrl = githubRepoUrl;

const defaultAfdianSupportUrl = "https://ifdian.net/a/dimthink";
const defaultKofiSupportUrl = "https://ko-fi.com/dimthink";

export const afdianSupportUrl = process.env.NEXT_PUBLIC_PRICEAI_AFDIAN_URL?.trim() || defaultAfdianSupportUrl;
export const kofiSupportUrl = process.env.NEXT_PUBLIC_PRICEAI_KOFI_URL?.trim() || defaultKofiSupportUrl;
export const paypalSupportUrl = process.env.NEXT_PUBLIC_PRICEAI_PAYPAL_URL?.trim() || null;

export const supportContactUrl = "https://t.me/dimthink";
