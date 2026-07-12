import cors from 'cors';
import express from 'express';
import fs from 'fs';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { routes } from './routes.js';

export const createApp = () => {
  fs.mkdirSync(env.uploadDir, { recursive: true });

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/uploads', express.static(env.uploadDir));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', routes);
  app.use(errorHandler);
  return app;
};
