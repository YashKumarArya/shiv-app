import { createApp } from './app.js';
import { env } from './config/env.js';

createApp().listen(env.port, () => console.log(`API running on http://localhost:${env.port}`));
