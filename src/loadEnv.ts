import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Only load .env.* locally (not in AWS Lambda)
if (!process.env.LAMBDA_TASK_ROOT) {
  const envFile = `.env.${process.env.NODE_ENV || 'local'}`;
  const fullPath = path.resolve(__dirname, '..', envFile);

  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath });
    console.log(`Loaded env config from ${envFile}`);
  } else {
    dotenv.config(); // fallback to .env
    console.warn(`No ${envFile} found. Loaded default .env`);
  }
}
