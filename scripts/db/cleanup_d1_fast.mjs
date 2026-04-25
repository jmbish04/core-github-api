import { execSync } from 'child_process';

const EXPECTED_EMPTY_TABLES = new Set([
  '_cf_KV',
  'd1_migrations',
  'sqlite_stat1',
]);

const STALE_THRESHOLD_DAYS = 30;
const TIMESTAMP_COLUMNS = ['created_at', 'timestamp', 'updated_at', 'date', 'occurred_at'];

function execCmd(cmd) {
  try {
    return execSync(cmd, { stdio: 'pipe' }).toString();
  } catch (error) {
    if (error.stdout) console.log(error.stdout.toString());
    if (error.stderr) console.error(error.stderr.toString());
    throw error;
  }
}

async function cleanupDb(binding) {
  console.log(`\n============ Scanning ${binding} ============`);
  const listCmd = `npx wrangler d1 execute ${binding} --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';" --json`;
  const result = execCmd(listCmd);
  const json = JSON.parse(result);
  const tables = json[0].results.map(r => r.name);
  
  let dropStatements = [];
  
  for (const table of tables) {
    if (EXPECTED_EMPTY_TABLES.has(table)) continue;
    
    // Check row count
    const countCmd = `npx wrangler d1 execute ${binding} --remote --command "SELECT count(*) as c FROM \\"${table}\\";" --json`;
    const countRes = JSON.parse(execCmd(countCmd));
    const rowCount = countRes[0].results[0].c;
    
    if (rowCount === 0) {
      console.log(`[EMPTY] Queueing ${table}...`);
      dropStatements.push(`DROP TABLE \\"${table}\\";`);
      continue;
    }
    
    // Check staleness
    let isStale = false;
    for (const col of TIMESTAMP_COLUMNS) {
      try {
        const tsCmd = `npx wrangler d1 execute ${binding} --remote --command "SELECT \\"${col}\\" as ts FROM \\"${table}\\" ORDER BY \\"${col}\\" DESC LIMIT 1;" --json`;
        const tsRes = JSON.parse(execCmd(tsCmd));
        const tsStr = tsRes[0]?.results?.[0]?.ts;
        if (tsStr) {
          const ageDays = (Date.now() - new Date(tsStr).getTime()) / (1000 * 3600 * 24);
          if (ageDays > STALE_THRESHOLD_DAYS) {
            isStale = true;
          }
          break;
        }
      } catch (e) {}
    }
    
    if (isStale) {
      console.log(`[STALE] Queueing ${table}...`);
      dropStatements.push(`DROP TABLE \\"${table}\\";`);
    }
  }
  
  if (dropStatements.length > 0) {
    console.log(`Executing ${dropStatements.length} drops...`);
    const fullCommand = dropStatements.join(' ');
    execCmd(`npx wrangler d1 execute ${binding} --remote --command "${fullCommand}"`);
  } else {
    console.log("No tables to drop.");
  }
}

async function main() {
  await cleanupDb('DB');
  await cleanupDb('DB_WEBHOOKS');
  console.log('Cleanup complete!');
}

main().catch(console.error);
