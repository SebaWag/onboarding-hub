import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, AuthUser } from '../types';
import { JWT_SECRET } from '../config/env';

/**
 * Extrae el token del header Authorization (Bearer) o del query param ?token=.
 * El query param existe para etiquetas <video>/<img>/descargas directas,
 * que no pueden enviar headers personalizados.
 */
const extractToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  if (typeof req.query.token === 'string' && req.query.token.length > 0) {
    return req.query.token;
  }
  return null;
};

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ success: false, error: 'No token provided' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }
    next();
  };
};
