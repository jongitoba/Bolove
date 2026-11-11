"use server";

import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { revalidatePath } from "next/cache";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Dev-only stand-in for a real Stripe checkout flow. Disabled whenever the
// app is built for production (i.e. any deployed Cloudflare Worker), so it
// can never grant access outside local development.
export async function grantDevAccess() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("grantDevAccess is disabled in production");
  }

  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Du må være logget inn");
  }

  const { env } = await getCloudflareContext({ async: true });
  const db = getDb(env.NEON_DATABASE_URL);

  await db
    .update(users)
    .set({ accessExpiresAt: new Date(Date.now() + THIRTY_DAYS_MS) })
    .where(eq(users.id, session.user.id));

  revalidatePath("/pricing");
}
