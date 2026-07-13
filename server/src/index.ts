import { createApp } from './app.js';
import { initDb } from './config/bootstrap.js';
import { env } from './config/env.js';

await initDb();
createApp().listen(env.port, () => console.log(`API running on http://localhost:${env.port}`));
