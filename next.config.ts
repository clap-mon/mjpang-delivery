import type { NextConfig } from "next";

const securityHeaders = [
  // 1. HSTS (HTTPS 강제 및 프로토콜 다운그레이드 방지)
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // 2. MIME 타입 스니핑 방지
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  // 3. 클릭재킹 방지 (외부 사이트 iframe 삽입 차단)
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  // 4. 레퍼러 정책 (민감한 URL 파라미터 노출 방지)
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  // 5. 브라우저 장치 권한 차단 (카메라, 마이크, 위치정보 등 미사용 디바이스 접근 제한)
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // 6. 콘텐츠 보안 정책 (CSP - 미인가 외부 스크립트 및 위험 리소스 차단)
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
