import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
  type NextMiddleware,
} from "next/server";
import { auth } from "@/auth";

// Gate for the entire (paid) route group. The rule is intentionally simple:
// logged in AND access_expires_at is in the future. No roles, no plans.
// See CLAUDE.md "Entitlement model".
//
// auth.ts builds its NextAuth config per-request (needed for Cloudflare env
// access), which makes `auth` itself async: `auth(callback)` resolves to the
// real middleware function rather than returning it directly. Resolving that
// once here is cheap - the config factory only actually runs on each real
// request, inside the resolved handler below.
const authMiddleware = auth((req) => {
  const expiresAt = req.auth?.user?.accessExpiresAt;
  const hasAccess = !!expiresAt && new Date(expiresAt) > new Date();

  if (!hasAccess) {
    const url = new URL("/pricing", req.nextUrl.origin);
    return NextResponse.redirect(url);
  }
});

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  // `auth(callback)` is typed as a union that also covers the App Router
  // route-handler overload, which TS can't narrow through the Promise - but
  // at runtime this is always the NextAuthMiddleware form, since we passed
  // a middleware callback (not a route handler) to `auth` above.
  const handler = (await authMiddleware) as unknown as NextMiddleware;
  return handler(req, event);
}

export const config = {
  matcher: [
    "/solkalkulator/:path*",
    "/kart/:path*",
    "/lanekalkulator/:path*",
    "/eierbrok/:path*",
    "/reisetid/:path*",
    "/stoynivaa/:path*",
  ],
};
