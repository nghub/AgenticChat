import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/jwt";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/embed",
  "/api/auth",
  "/api/public",
  "/api/health",
  "/widget.js",
  "/_next",
  "/favicon.ico",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isPublic) return withSecurityHeaders(NextResponse.next(), pathname);

  const session = getSessionFromRequest(request);
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return withSecurityHeaders(NextResponse.redirect(loginUrl), pathname);
  }

  return withSecurityHeaders(NextResponse.next(), pathname);
}

function withSecurityHeaders(response: NextResponse, pathname: string): NextResponse {
  // The embed page is the only document that may capture audio: the optional
  // avatar's "Speak with ..." button starts the mic, and a policy of
  // microphone=() makes Chrome refuse without ever prompting. Everything else
  // (dashboard, marketing, API) keeps it blocked. A host page embedding the
  // iframe must still delegate with allow="microphone" - see widget.js.
  const isEmbed = pathname === "/embed" || pathname.startsWith("/embed/");
  const microphone = isEmbed ? "microphone=(self)" : "microphone=()";
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", `camera=(), ${microphone}, geolocation=(), payment=()`);
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
