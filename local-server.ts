// local-server.ts

import 'dotenv/config'; // Automatically loads .env.local
import { app } from './src/index';

const PORT = process.env.PORT || 6060;

app.listen(PORT, () => {
  console.log(`Local server running on http://localhost:${PORT}`);
});