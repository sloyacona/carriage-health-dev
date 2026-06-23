import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Force HTTPS for 2 years; includeSubDomains covers any subdomains
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          // Prevent this app from being embedded in any iframe (clickjacking)
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          // Prevent browsers from MIME-sniffing away from the declared Content-Type
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // On cross-origin navigations, send only the origin (not the full path).
          // Prevents /results, /intake, etc. from leaking in Referer headers to
          // any third-party server the patient navigates to.
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Disable browser features this app never uses.
          // payment= is intentionally omitted — Stripe's Payment Request API
          // (Apple Pay / Google Pay) uses it and we may want it in future.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), usb=(), bluetooth=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
