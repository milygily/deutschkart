import { defineConfig } from 'drizzle-kit';
import fs from 'node:fs';
import path from 'node:path';

if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*["']?(.+?)["']?\s*$/);
      if (match) {
        process.env.DATABASE_URL = match[1];
        break;
      }
    }
  }
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
