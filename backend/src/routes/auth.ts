import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/env';
import { internalError } from '../utils/http';

const router = Router();

// Rate limiting por IP para frenar fuerza bruta y abuso de registro.
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados intentos de login. Espera un minuto.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados registros desde esta IP. Espera un minuto.' },
});

// POST /api/auth/register
router.post('/register', registerLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, name, department, position } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password required' });
      return;
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      res.status(409).json({ success: false, error: 'Email already registered' });
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (email, password_hash, name, department, position)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, role, department, position`,
      [email, password_hash, name, department, position]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as SignOptions
    );

    res.status(201).json({ success: true, data: { user, token } });
  } catch (err: any) {
    internalError(res, err);
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password required' });
      return;
    }

    const result = await query(
      'SELECT id, email, password_hash, name, role, department, position FROM users WHERE email = $1 AND is_active = true',
      [email]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as SignOptions
    );

    const { password_hash: _password_hash, ...userData } = user;
    res.json({ success: true, data: { user: userData, token } });
  } catch (err: any) {
    internalError(res, err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.name, u.role, u.department, u.position, u.avatar_url, u.hire_date,
              om.org_id, om.org_role, o.name as org_name, o.slug as org_slug
       FROM users u
       LEFT JOIN org_members om ON u.id = om.user_id
       LEFT JOIN organizations o ON om.org_id = o.id
       WHERE u.id = $1`,
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    internalError(res, err);
  }
});

export default router;
