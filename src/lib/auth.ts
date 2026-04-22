import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        userId: { label: "User ID", type: "text" },
        pin: { label: "PIN", type: "password" },
        organizationId: { label: "Organization ID", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.organizationId) return null;
        const orgId = credentials.organizationId as string;

        // Cashier PIN login — requires specific userId + pin
        if (credentials.userId && credentials.pin) {
          const user = await db.user.findFirst({
            where: { id: credentials.userId as string, organizationId: orgId, active: true, role: "CASHIER" },
          });
          if (!user || !user.pin) return null;
          const valid = await bcrypt.compare(credentials.pin as string, user.pin);
          if (!valid) return null;
          return { id: user.id, name: user.name, email: user.email, role: user.role, organizationId: user.organizationId };
        }

        // Admin email + password login
        if (credentials.email && credentials.password) {
          const user = await db.user.findUnique({
            where: { organizationId_email: { organizationId: orgId, email: credentials.email as string } },
          });
          if (!user || !user.passwordHash || !user.active) return null;
          const valid = await bcrypt.compare(credentials.password as string, user.passwordHash);
          if (!valid) return null;
          return { id: user.id, name: user.name, email: user.email, role: user.role, organizationId: user.organizationId };
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
        token.organizationId = (user as { organizationId: string }).organizationId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.organizationId = token.organizationId as string;
      }
      return session;
    },
  },
});
