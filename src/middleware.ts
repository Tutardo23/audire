import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);
const isAuthRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

// ✅ Headers de seguridad aplicados a todas las respuestas
function applySecurityHeaders(response: NextResponse): NextResponse {
  // Evita que el browser adivine el Content-Type
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Evita que la app sea embebida en iframes de otros dominios (anti-clickjacking)
  response.headers.set("X-Frame-Options", "SAMEORIGIN");

  // Activa protección XSS del browser (legacy, pero no hace daño)
  response.headers.set("X-XSS-Protection", "1; mode=block");

  // No enviar el Referer a dominios externos
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permisos del browser: desactiva lo que no usás
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );

  // ✅ HSTS: fuerza HTTPS en producción (solo aplica en Vercel/dominio real)
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  // Content Security Policy — ajustá los dominios según lo que uses
  const scriptSrc = process.env.NODE_ENV === "production"
    ? "script-src 'self' 'unsafe-inline' https://clerk.apdes.ar https://*.clerk.accounts.dev https://*.clerk.com"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://clerk.apdes.ar https://*.clerk.accounts.dev https://*.clerk.com";

  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      scriptSrc,
      // Clerk usa Web Workers desde blob: URLs
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.clerk.com https://img.clerk.com",
      "connect-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://clerk.apdes.ar https://*.neon.tech https://generativelanguage.googleapis.com https://clerk-telemetry.com",
      "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );

  return response;
}

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const session = await auth();
 const pathname = req.nextUrl.pathname;

  if (pathname.startsWith("/api/ai/analyze-comments")) {
    return NextResponse.next();
  }
  // ✅ Si está logueado y entra a sign-in/sign-up → dashboard
  if (session.userId && isAuthRoute(req)) {
    const response = NextResponse.redirect(new URL("/dashboard", req.url));
    return applySecurityHeaders(response);
  }

  // ✅ Si NO está logueado y entra a ruta protegida → home
  if (!session.userId && !isPublicRoute(req)) {
    const url = new URL("/", req.url);
    url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    const response = NextResponse.redirect(url);
    return applySecurityHeaders(response);
  }

  // ✅ Siempre devolver NextResponse con headers de seguridad
  const response = NextResponse.next();
  return applySecurityHeaders(response);
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};