/**
 * @file src/db/schema-drafts.ts
 * @description Drizzle schema for Repo Drafts (HIL Project Settings).
 */

import {
    sqliteTable,
    text,
    integer,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Repo Drafts Table
// Stores pending project/repo settings for Human-in-the-Loop approval.

