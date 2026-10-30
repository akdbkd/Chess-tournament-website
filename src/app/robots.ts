import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      ...(process.env.NEXT_PUBLIC_DEMO_MODE === "true"
        ? { disallow: "/" }
        : {
            allow: "/",
            disallow: ["/admin", "/dashboard", "/api/", "/reset-password"],
          }),
    },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/sitemap.xml`,
  };
}
