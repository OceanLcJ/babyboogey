import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { envConfigs } from "@/config";

// Global cache for database connection pool
// This ensures we reuse the same connection pool within the same worker/process
// In serverless environments like Vercel, each worker gets its own global scope
declare global {
  var __db_client: postgres.Sql | undefined;
  var __db_instance: ReturnType<typeof drizzle> | undefined;
}

export function db() {
  const databaseUrl = envConfigs.database_url;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  // Return cached instance if it exists in the current worker
  if (global.__db_instance && global.__db_client) {
    return global.__db_instance;
  }

  // Create new connection pool with optimized settings for serverless
  const client = postgres(databaseUrl, {
    prepare: false, // Disable prepared statements for serverless
    max: 1, // Limit to 1 connection per worker in serverless environment
    idle_timeout: 20, // Close idle connections after 20 seconds
    max_lifetime: 60 * 30, // Close connections after 30 minutes
    connect_timeout: 10, // Connection timeout (seconds)
    // Allow connections to be reused across multiple queries
    connection: {
      application_name: envConfigs.app_name,
    },
  });

  // Create drizzle instance
  const dbInstance = drizzle({ client });

  // Cache both client and instance globally for this worker
  global.__db_client = client;
  global.__db_instance = dbInstance;

  return dbInstance;
}
