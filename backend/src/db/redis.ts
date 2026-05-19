import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379/2');
const PREFIX = process.env.REDIS_PREFIX || 'oh:';

redis.on('connect', () => {
  console.log('🔴 Connected to Redis (DB 2, prefix: oh:)');
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err.message);
});

export const cacheGet = async (key: string): Promise<string | null> => {
  return redis.get(`${PREFIX}${key}`);
};

export const cacheSet = async (key: string, value: string, ttl: number = 3600): Promise<void> => {
  await redis.set(`${PREFIX}${key}`, value, 'EX', ttl);
};

export const cacheDel = async (key: string): Promise<void> => {
  await redis.del(`${PREFIX}${key}`);
};

export default redis;
