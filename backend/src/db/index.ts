import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('connect', () => {
  console.log('📦 Connected to PostgreSQL (onboarding_hub)');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL error:', err.message);
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
export default pool;
