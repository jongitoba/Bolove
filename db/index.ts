import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Neon's HTTP driver works over fetch, so it runs fine in the Workers runtime
// (no TCP sockets, no Node `pg` driver). Never swap this for `node-postgres`.
export function getDb(databaseUrl: string) {
  return drizzle(databaseUrl, { schema });
}
