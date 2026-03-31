import { initJules } from '../utils.mjs';

try {
  const jules = await initJules();
  
  const arg = process.argv[2] || 'failed=10';
  const [filterType, filterValue] = arg.split('=');
  
  if (!filterType || !filterValue) {
    console.error('Usage: node select.mjs <status=value|type=value> (e.g., state=failed, type=agentMessaged)');
    process.exit(1);
  }

  let query = {};
  if (filterType === 'state') {
    query = {
      from: 'sessions',
      where: { state: filterValue },
      limit: 10
    };
  } else if (filterType === 'type') {
    query = {
      from: 'activities',
      where: { type: filterValue },
      order: 'desc',
      limit: 10
    };
  } else {
    console.error('Unsupported filter type. Use state=... or type=...');
    process.exit(1);
  }

  console.log(`Querying ${query.from} where ${filterType} = ${filterValue}...`);
  const results = await jules.select(query);
  
  console.log(`\nFound ${results.length} results.`);
  console.log(JSON.stringify(results, null, 2));

} catch (err) {
  console.error('Query failed:', err.message);
}
