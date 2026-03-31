
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { createSchemaFactory } from 'drizzle-zod';
import { eq, sql, getTableColumns } from 'drizzle-orm';
import { DrizzleD1Database } from 'drizzle-orm/d1';

const { createSelectSchema, createInsertSchema } = createSchemaFactory({ zodInstance: z });

type Bindings = { DB: D1Database };
type Variables = { db: DrizzleD1Database<any> };

/**
 * Creates a Hono app with CRUD routes for a Drizzle table
 * @param table The Drizzle table object
 * @param tableName Name for OpenAPI tags/schemas
 */
export function createCrudApi(table: any, tableName: string) {
  const app = new OpenAPIHono<{ bindings: Env; Variables: Variables }>();

  // Helper: Coerce dates for JSON APIs (because JSON passes dates as strings)
  const coerceDates = (schema: any) => {
    const newShape: any = {};
    for (const key in schema.shape) {
        const field = schema.shape[key];
        // Strategy: Force coercion for known date fields to handle JSON string inputs
        // This is more robust than checking Zod internal types which can be wrapped or vary.
        if (['date', 'createdAt', 'updatedAt', 'timestamp', 'deadline', 'completedAt'].includes(key)) {
             if (field.isOptional && field.isOptional()) {
                 newShape[key] = z.coerce.date().optional();
             } else if (field.isNullable && field.isNullable()) {
                 newShape[key] = z.coerce.date().nullable();
             } else {
                 newShape[key] = z.coerce.date();
             }
        }
    }
    return schema.extend(newShape);
  };

  // Generate Zod schemas from Drizzle table
  const SelectSchema = (createSelectSchema(table) as any).openapi(`${tableName}Select`);
  const InsertSchema = coerceDates(createInsertSchema(table)).openapi(`${tableName}Insert`);
  // For updates, we make all fields optional
  const UpdateSchema = coerceDates(createInsertSchema(table)).partial().openapi(`${tableName}Update`);

  // --- DEBUG: Schema Inspection ---
  app.get('/debug-keys', (c) => {
      const keys = Object.keys((InsertSchema as any).shape || {});
      return c.json({ tableName, keys });
  });

  // --- 1. LIST ALL ---
  app.openapi(
    createRoute({
    operationId: 'getRoot',
      method: 'get',
      path: '/',
      responses: { 
        200: { 
          content: { 
            'application/json': { 
              schema: z.array(SelectSchema) 
            } 
          }, 
          description: `List all ${tableName}` 
        } 
      },
      tags: [tableName]
    }),
    async (c) => {
        const db = c.get('db'); 
        const results = await db.select().from(table).all();
        return c.json(results);
    }
  );

  // --- 2. GET BY ID ---
  app.openapi(
    createRoute({
    operationId: 'getId',
      method: 'get',
      path: '/{id}',
      request: { params: z.object({ id: z.string() }) },
      responses: { 
        200: { content: { 'application/json': { schema: SelectSchema } }, description: `Get ${tableName}` },
        404: { description: 'Not Found' }
      },
      tags: [tableName]
    }),
    async (c) => {
      const id = c.req.valid('param').id;
      const db = c.get('db');
      const [result] = (await db.select().from(table).where(eq(table.id, id))) as unknown as any[];
      return result ? c.json(result) : c.json({ error: 'Not Found' }, 404);
    }
  );

  // --- 3. CREATE ---
  app.openapi(
    createRoute({
    operationId: 'postRoot',
      method: 'post',
      path: '/',
      request: { body: { content: { 'application/json': { schema: InsertSchema } } } },
      responses: { 201: { content: { 'application/json': { schema: SelectSchema } }, description: 'Created' } },
      tags: [tableName]
    }),
    async (c) => {
      const body = c.req.valid('json');
      const db = c.get('db');
      const [result] = (await db.insert(table).values(body).returning()) as unknown as any[];
      return c.json(result, 201);
    }
  );

  // --- 4. UPDATE ---
  app.openapi(
    createRoute({
    operationId: 'patchId',
      method: 'patch',
      path: '/{id}',
      request: { 
        params: z.object({ id: z.string() }),
        body: { content: { 'application/json': { schema: UpdateSchema } } } 
      },
      responses: { 200: { content: { 'application/json': { schema: SelectSchema } }, description: 'Updated' } },
      tags: [tableName]
    }),
    async (c) => {
      const id = c.req.valid('param').id;
      const body = c.req.valid('json');
      const db = c.get('db');
      const [result] = (await db.update(table).set(body).where(eq(table.id, id)).returning()) as unknown as any[];
      return c.json(result);
    }
  );

  // --- 5. DELETE ---
  app.openapi(
    createRoute({
    operationId: 'deleteId',
      method: 'delete',
      path: '/{id}',
      request: { params: z.object({ id: z.string() }) },
      responses: { 204: { description: 'Deleted' } },
      tags: [tableName]
    }),
    async (c) => {
      const id = c.req.valid('param').id;
      const db = c.get('db');
      await db.delete(table).where(eq(table.id, id));
      return c.body(null, 204);
    }
  );

  // --- 6. BATCH UPSERT ---
  app.openapi(
    createRoute({
    operationId: 'postBatch',
      method: 'post',
      path: '/batch',
      request: { 
        body: { 
          content: { 
            'application/json': { 
              schema: z.array(InsertSchema) 
            } 
          } 
        } 
      },
      responses: { 
        200: { 
          content: { 
            'application/json': { 
              schema: z.object({ success: z.boolean(), count: z.number() }) 
            } 
          }, 
          description: 'Batch Upsert Success' 
        },
        400: { description: 'Validation Error' }
      },
      tags: [tableName]
    }),
    async (c) => {
      const body = c.req.valid('json');
      if (!body.length) return c.json({ success: true, count: 0 });

      const db = c.get('db');
      
      // 1. Identify valid columns and count parameters per record
      const columns = getTableColumns(table);
      const columnNames = Object.keys(columns);
      const columnCount = columnNames.length;
      
      const updateSet: Record<string, any> = {};
      columnNames.forEach(key => {
          if (key !== 'id' && key !== 'createdAt') {
               const col = columns[key];
               updateSet[key] = sql.raw(`excluded.${col.name}`);
          }
      });

      // 2. Calculate Safe Chunk Size based on D1 Limit (100 params per query)
      // We use 90 to be safe (leaving room for overhead or schema variances)
      const MAX_BIND_VARS = 90; 
      const chunkSize = Math.floor(MAX_BIND_VARS / Math.max(1, columnCount));
      const safeChunkSize = Math.max(1, chunkSize);
      
      // Debug log (can be seen in `wrangler tail`)
      // console.log(`[Batch] Cols: ${columnCount}, ChunkSize: ${safeChunkSize}, Records: ${body.length}`);

      // 3. Prepare Batch Statements
      const statements: any[] = [];
      for (let i = 0; i < body.length; i += safeChunkSize) {
          const chunk = body.slice(i, i + safeChunkSize);
          statements.push(
              db.insert(table)
                .values(chunk)
                .onConflictDoUpdate({
                    target: table.id,
                    set: updateSet
                })
          );
      }

      try {
          // 4. Execute Batch (D1 limit is 100 statements per batch, which covers ~500-800 records depending on cols)
          if (statements.length > 0) {
            await db.batch(statements as [any, ...any[]]);
          }

          return c.json({ success: true, count: body.length });
      } catch (e: any) {
          console.error(`Batch upsert failed for ${tableName}:`, e);
          // Return valid JSON error for debugging
          return c.json({ success: false, error: e.message, details: String(e) }, 400);
      }
    }
  );

  return app;
}
