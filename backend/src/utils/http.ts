import { Response } from 'express';

/**
 * Respuesta 500 uniforme para todos los handlers.
 * En produccion nunca expone el mensaje interno del error
 * (stack traces, SQL, rutas del filesystem, etc.).
 */
export const internalError = (res: Response, err: unknown): void => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`❌ [${new Date().toISOString()}] ${message}`);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
  });
};
