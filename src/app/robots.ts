import type { MetadataRoute } from "next";

const siteUrl = "https://priceai.cc";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/.well-known/price-radar.json", "/price-radar-api.md", "/price-radar-v1.schema.json", "/official-prices", "/official-api", "/api-transit", "/wholesale", "/products/", "/platforms/", "/guides/"],
      disallow: [
        "/admin",
        "/api/",
        "/*?*back=",
        "/*?*exclude=",
        "/*?*max=",
        "/*?*min=",
        "/*?*noticePreview=",
        "/*?*platform=",
        "/*?*q=",
        "/*?*scope=",
        "/*?*sort=",
        "/*?*stock=",
        "/*?*submit=",
        "/*?*tags=",
        "/*?*type=",
        "/*?*view=",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
