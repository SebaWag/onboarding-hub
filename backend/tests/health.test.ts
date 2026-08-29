/**
 * Test de humo del endpoint de salud.
 * Requiere PostgreSQL y Redis accesibles via DATABASE_URL / REDIS_URL
 * (en CI son service containers; en local: docker run efimeros).
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('GET /api/health', () => {
  it('responde 200 con postgres y redis ok', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.services.postgres).toBe('ok');
    expect(res.body.services.redis).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('expone el indice de la API en /', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('OnboardingHub API');
    expect(res.body.endpoints.auth).toBe('/api/auth');
  });
});
