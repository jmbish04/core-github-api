import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Ensures the JULES_API_KEY is loaded into the environment.
 * It tries:
 * 1. Existing process.env.JULES_API_KEY
 * 2. `tokens show JULES_API_KEY --value-only`
 * 3. Local .env file
 */
export async function ensureApiKey() {
  if (process.env.JULES_API_KEY) return;

  try {
    const token = execSync('tokens show JULES_API_KEY --value-only', { 
      encoding: 'utf8', 
      stdio: ['pipe', 'pipe', 'ignore'] 
    }).trim();
    
    if (token) {
      process.env.JULES_API_KEY = token;
      return;
    }
  } catch (err) {
    // Fallback to .env
  }

  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^JULES_API_KEY=(.*)$/m);
    if (match) {
      process.env.JULES_API_KEY = match[1].trim().replace(/^["']|["']$/g, '');
    }
  }
}

/**
 * Initializes the Jules SDK and returns the Jules instance.
 */
export async function initJules() {
  await ensureApiKey();
  const { jules } = await import('@google/jules-sdk');
  return jules;
}
