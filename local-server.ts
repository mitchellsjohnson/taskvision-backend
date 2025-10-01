// local-server.ts

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); // Load .env.local explicitly
import { app } from './src/index';

const PORT = process.env.PORT || 6060;

app.listen(PORT, () => {
  console.log(`Local server running on http://localhost:${PORT}`);
});