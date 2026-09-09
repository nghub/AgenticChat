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
  "/widget-demo.html", // static host page that loads widget.js, for trying the launcher
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
  // Only documents that carry the chat may capture audio: the embed page
  // itself, and any page on this origin that hosts the widget iframe. A host
  // document with microphone=() cannot delegate the mic to an iframe no matter
  // what its allow attribute says, so the demo page must be allowed too.
  // Everything else (dashboard, marketing, API) keeps it blocked. Customer
  // sites that set their own Permissions-Policy need
  //   microphone=(self "https://<this app's origin>")
  // see docs/avatar-poc/HANDOFF.md.
  const allowsMic =
    pathname === "/embed" || pathname.startsWith("/embed/") || pathname === "/widget-demo.html";
  const microphone = allowsMic ? "microphone=(self)" : "microphone=()";
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", `camera=(), ${microphone}, geolocation=(), payment=()`);
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
