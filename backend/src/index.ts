/**
 * Entrypoint de produccion: solo arranque del servidor HTTP y ciclo de vida.
 * La configuracion Express vive en src/app.ts (exportada para supertest).
 */
import app, { PORT } from './app';
import pool from './db';

const server = app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║         OnboardingHub API                 ║
  ║         Port: ${PORT}                        ║
  ╚═══════════════════════════════════════════╝
    `);
});

// Graceful shutdown: drena conexiones HTTP y cierra el pool de PG.
const shutdown = (signal: string): void => {
  console.log(`\n${signal} recibido: cerrando servidor...`);
  server.close(() => {
    pool.end().then(() => {
      console.log('Servidor y pool cerrados limpiamente.');
      process.exit(0);
    });
  });
  // Force-kill si algo cuelga el drenaje
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default server;
