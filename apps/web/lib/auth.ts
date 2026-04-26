import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import prisma from "./prisma";
import { authConfig } from "./auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        return token;
      }
      if (!token.id) return token;

      // Refresh role from DB and auto-promote from ADMIN_EMAILS so
      // admin changes take effect without re-login.
      //
      // Failure modes are deliberately split:
      //   • findUnique returns null → user record was deleted/banned
      //     → return null, signs the user out next request.
      //   • findUnique throws → infra problem (table missing, postgres
      //     restarting, network blip) → keep the existing JWT claims,
      //     log a warning. We don't want a transient DB hiccup to log
      //     every user out.
      let dbUser;
      try {
        dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { id: true, email: true, role: true },
        });
      } catch (err) {
        console.warn("[auth] jwt role refresh skipped (DB unreachable):", err);
        return token;
      }
      if (!dbUser) return null;

      const adminEmails = (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      if (
        adminEmails.includes(dbUser.email.toLowerCase()) &&
        dbUser.role !== "ADMIN"
      ) {
        try {
          await prisma.user.update({
            where: { id: dbUser.id },
            data: { role: "ADMIN" },
          });
          token.role = "ADMIN";
        } catch (err) {
          console.warn("[auth] admin auto-promote skipped:", err);
          token.role = dbUser.role;
        }
      } else {
        token.role = dbUser.role;
      }
      return token;
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user) {
          return null;
        }

        const isPasswordValid = await compare(credentials.password as string, user.passwordHash);

        if (!isPasswordValid) {
          return null;
        }

        // Auto-promote users listed in ADMIN_EMAILS
        let { role } = user;
        const adminEmails = (process.env.ADMIN_EMAILS || "")
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);
        if (adminEmails.includes(user.email.toLowerCase()) && role !== "ADMIN") {
          await prisma.user.update({
            where: { id: user.id },
            data: { role: "ADMIN" },
          });
          role = "ADMIN";
        }

        return {
          id: user.id,
          email: user.email,
          name: user.username,
          role,
        };
      },
    }),
  ],
});
