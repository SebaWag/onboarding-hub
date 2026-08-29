/**
 * Tests de autenticacion contra DB real (migraciones aplicadas).
 * Cubre: registro, login invalido (401), login valido y rate limiting.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app';

const uniqueEmail = () => `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}@onboarding.test`;

describe('POST /api/auth/register', () => {
  it('registra usuario nuevo y devuelve token', async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Secreta123!', name: 'Usuario Test' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe(email);
  });

  it('rechaza registro duplicado con 409', async () => {
    const email = uniqueEmail();
    await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Secreta123!', name: 'Primero' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Otra12345!', name: 'Duplicado' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/auth/login', () => {
  it('rechaza credenciales invalidas con 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'no-existe@test.local', password: 'Incorrecta1!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('acepta credenciales validas y devuelve token', async () => {
    const email = uniqueEmail();
    await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Secreta123!', name: 'Login Test' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Secreta123!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
  });

  it('aplica rate limit: devuelve 429 al abusar del login', async () => {
    // El limiter permite 5/min por IP; iterando debe aparecer un 429 pronto.
    // Los intentos previos de este archivo ya consumieron parte de la ventana.
    let saw429 = false;
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'bruteforce@test.local', password: 'Falla1234!' });
      statuses.push(res.status);
      if (res.status === 429) { saw429 = true; break; }
    }
    expect(saw429).toBe(true);
  });
});
