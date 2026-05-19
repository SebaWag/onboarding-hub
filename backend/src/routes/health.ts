import { Router, Request, Response } from 'express';
import { query } from '../db';
import redis from '../db/redis';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const checks: any = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {}
  };

  // Check PostgreSQL
  try {
    await query('SELECT 1');
    checks.services.postgres = 'ok';
  } catch {
    checks.services.postgres = 'error';
    checks.status = 'degraded';
  }

  // Check Redis
  try {
    await redis.ping();
    checks.services.redis = 'ok';
  } catch {
    checks.services.redis = 'error';
    checks.status = 'degraded';
  }

  const statusCode = checks.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(checks);
});

export default router;
