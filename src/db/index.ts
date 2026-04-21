import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as rawSchema from "./schema/market";
import * as featureSchema from "./schema/feature";
import "dotenv/config";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
});


const combinedSchema = { ...rawSchema, ...featureSchema };

export const db = drizzle(pool, { schema: combinedSchema });