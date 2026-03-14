import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const CreateSecretSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, 'Name must only contain letters, numbers, underscores, or hyphens'),
  value: z.string().min(1, 'Secret value must not be empty'),
  description: z.string().optional()
});
