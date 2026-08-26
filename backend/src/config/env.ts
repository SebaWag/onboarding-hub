/**
 * Configuración central de variables de entorno críticas.
 * Fail-fast: si falta una variable requerida, el proceso muere al boot
 * en lugar de correr con valores inseguros por defecto.
 */

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[BOOT] Variable de entorno requerida ausente: ${name}. ` +
        `Copia .env.example a .env y configura los valores antes de iniciar.`
    );
  }
  return value;
};

// SEGURIDAD
export const JWT_SECRET = required('JWT_SECRET');
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ALMACENAMIENTO (SeaweedFS / S3-compatible)
export const SEAWEEDFS_ACCESS_KEY = required('SEAWEEDFS_ACCESS_KEY');
export const SEAWEEDFS_SECRET_KEY = required('SEAWEEDFS_SECRET_KEY');

// Version unica de la app (evita banners/root-endpoint desincronizados)
export const APP_VERSION = '1.1.0';
