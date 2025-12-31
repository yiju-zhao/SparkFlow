import { auth } from "@/lib/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith("/login") ||
                     req.nextUrl.pathname.startsWith("/signup");
  const isPublicPage = req.nextUrl.pathname === "/" ||
                       req.nextUrl.pathname.startsWith("/api/auth");

  // Redirect logged-in users away from auth pages
  if (isLoggedIn && isAuthPage) {
    return Response.redirect(new URL("/dashboard", req.nextUrl));
  }

  // Protect dashboard and studio routes
  if (!isLoggedIn && !isAuthPage && !isPublicPage) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
