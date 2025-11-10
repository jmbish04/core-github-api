import { Env } from "../types";
import { getKysely, insertTestResult, listActiveTests } from "../utils/db";
import { TEST_DEFINITIONS, TEST_FUNCTIONS } from "./defs";
import { analyzeTestFailure } from "../utils/ai";
import { Kysely } from "kysely";
import { DB } from "../schemas/dbSchemas";

async function seedTests(db: Kysely<DB>) {
    const existingTests = await db.selectFrom('test_defs').selectAll().execute();
    if (existingTests.length === 0) {
        for (const def of TEST_DEFINITIONS) {
            await db.insertInto('test_defs').values({ ...def, id: crypto.randomUUID() }).execute();
        }
    }
}

export async function runAllTests(env: Env, session_uuid?: string) {
    const sessionId = session_uuid || crypto.randomUUID();
    const db = getKysely(env);

    await seedTests(db);

    const activeTests = await listActiveTests(db);

    const testPromises = activeTests.map(async (test) => {
        const started_at = new Date().toISOString();
        const testFn = TEST_FUNCTIONS[test.name];

        if (!testFn) {
            console.error(`No test function found for test: ${test.name}`);
            return;
        }

        const startTime = Date.now();
        const result = await testFn(env);
        const duration_ms = Date.now() - startTime;

        let ai_human_readable_error_description: string | undefined = undefined;
        let ai_prompt_to_fix_error: string | undefined = undefined;

        if (!result.pass && result.error) {
            const aiAnalysis = await analyzeTestFailure(env, test.name, result.error);
            ai_human_readable_error_description = aiAnalysis.humanReadableDescription;
            ai_prompt_to_fix_error = aiAnalysis.fixSuggestion;
        }

        await insertTestResult(db, {
            session_uuid: sessionId,
            test_fk: test.id,
            started_at,
            finished_at: new Date().toISOString(),
            duration_ms,
            status: result.pass ? 'pass' : 'fail',
            error_code: result.error,
            raw: JSON.stringify(result.raw),
            ai_human_readable_error_description,
            ai_prompt_to_fix_error,
        });
    });

    await Promise.all(testPromises);

    return sessionId;
}
