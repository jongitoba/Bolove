import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

// Config is built per-request (not at module scope) because Cloudflare
// bindings/secrets are only reliably available via getCloudflareContext()
// once a request is in flight - see CLAUDE.md "Workers runtime constraint".
export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const { env } = await getCloudflareContext({ async: true });
  const db = getDb(env.NEON_DATABASE_URL);

  return {
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    providers: [
      Resend({
        apiKey: env.RESEND_API_KEY,
        from: env.AUTH_EMAIL_FROM ?? "Bolove <onboarding@resend.dev>",
      }),
    ],
    session: { strategy: "database" },
    secret: env.AUTH_SECRET,
    pages: {
      signIn: "/logg-inn",
      verifyRequest: "/logg-inn/sjekk-e-post",
      error: "/logg-inn",
    },
    trustHost: true,
    callbacks: {
      session({ session, user }) {
        session.user.accessExpiresAt =
          (user as { accessExpiresAt?: Date | null }).accessExpiresAt ?? null;
        return session;
      },
    },
  };
});
