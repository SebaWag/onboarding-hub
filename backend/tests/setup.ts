/**
 * Setup de entorno para tests.
 * Completa SOLO variables ausentes con valores de prueba, de modo que:
 *  - en local no se necesita ningun .env para correr los tests;
 *  - en CI los valores reales/placeholder de secrets siguen ganando.
 * Las credenciales aqui son placeholders sin valor alguno fuera de tests.
 */
process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-no-usar-en-produccion-1234567890';
process.env.SEAWEEDFS_ACCESS_KEY ??= 'test-access-key';
process.env.SEAWEEDFS_SECRET_KEY ??= 'test-secret-key';
process.env.SEAWEEDFS_ENDPOINT ??= 'localhost';
process.env.SEAWEEDFS_PORT ??= '8333';
