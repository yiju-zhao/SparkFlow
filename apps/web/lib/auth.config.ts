import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const authConfig: NextAuthConfig = {
  trustHost: true, // Trust host when external port differs from internal
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const userRole = auth?.user?.role;

      // Strip locale prefix to normalize path matching
      // e.g. /en/deepdive → /deepdive, /zh/login → /login, /en → /
      const path = nextUrl.pathname.replace(/^\/(en|zh)/, "") || "/";

      // Admin route protection
      if (path.startsWith("/admin") && (!isLoggedIn || userRole !== "ADMIN")) {
        return Response.redirect(new URL("/access-denied", nextUrl));
      }

      const isAuthPage =
        path.startsWith("/login") || path.startsWith("/signup");
      const isPublicPage =
        path === "/" ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname === "/api/signup";

      // Redirect logged-in users away from auth pages
      if (isLoggedIn && isAuthPage) {
        // Extract locale from original path, default to "en"
        const locale = nextUrl.pathname.match(/^\/(en|zh)/)?.[1] || "en";
        return Response.redirect(new URL(`/${locale}/deepdive`, nextUrl));
      }

      // Redirect unauthenticated users to landing page
      if (!isLoggedIn && !isAuthPage && !isPublicPage) {
        const locale = nextUrl.pathname.match(/^\/(en|zh)/)?.[1] || "en";
        return Response.redirect(new URL(`/${locale}`, nextUrl));
      }

      return true;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
};
