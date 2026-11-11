// Shape of the bindings/vars/secrets available via getCloudflareContext().env,
// both under `wrangler dev`/deploy and under `next dev` (from .dev.vars).
// Keep this in sync with the secrets listed in wrangler.toml / CLAUDE.md.
interface CloudflareEnv {
  NEON_DATABASE_URL: string;
  AUTH_SECRET: string;
  RESEND_API_KEY: string;
  AUTH_EMAIL_FROM?: string;
}
