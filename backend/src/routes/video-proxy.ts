import { Router, Response } from 'express';
import { AuthRequest } from '../types';
import { authenticate } from '../middleware/auth';
import { getFileStream } from '../services/storage';

const router = Router();

// =====================================================
// SeaweedFS Video/File Proxy (autenticado)
// =====================================================

/**
 * GET /api/storage/:path(*)
 * Proxy para archivos de video y otros desde SeaweedFS.
 *
 * Requiere autenticación: header `Authorization: Bearer <jwt>`
 * o query param `?token=<jwt>` (para <video>, <img> y descargas,
 * que no pueden enviar headers personalizados).
 */
// Express 5 / path-to-regexp v8: las wildcards deben ser nombradas ('/*splat').
// El parametro 'splat' captura el resto del path incluyendo barras.
router.get('/*splat', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Express 5 / path-to-regexp v8: los wildcards pueden venir como array.
    // Normalizar SIEMPRE a string para no romper .endsWith()/getFileStream().
    const rawPath = (req.params.splat ?? req.params[0] ?? '') as string | string[]
    const filePath = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath).replace(/^\/+/, '')

    // Determinar content type basado en extensión
    let contentType = 'video/webm';
    if (filePath.endsWith('.mp4')) contentType = 'video/mp4';
    else if (filePath.endsWith('.wav')) contentType = 'audio/wav';
    else if (filePath.endsWith('.ogg')) contentType = 'audio/ogg';
    else if (filePath.endsWith('.srt')) contentType = 'text/plain';
    else if (filePath.endsWith('.vtt')) contentType = 'text/vtt';
    else if (filePath.endsWith('.png')) contentType = 'image/png';
    else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (filePath.endsWith('.pdf')) contentType = 'application/pdf';

    // ═══════════════════════════════════════════════════════════════════
    // FIX: Soporte de HTTP Range Requests (206 Partial Content)
    // ─────────────────────────────────────────────────────────────────────
    // El <video> del navegador envía el header `Range` para pedir solo un
    // segmento del archivo (probe de metadata, seek, buffer progresivo).
    // Si el servidor responde 200 con el archivo completo en lugar de un
    // 206 con Content-Range, el player no puede calcular la duración real
    // ni avanzar en el timeline (bug: duración de 7-9s en videos largos).
    const rangeHeader = req.headers.range as string | undefined;

    // Obtener stream desde SeaweedFS (pasando el Range si viene)
    const response = await getFileStream(filePath, rangeHeader);

    const baseHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    };

    if (rangeHeader && response.ContentRange) {
      // El navegador pidió un rango: responder 206 Partial Content
      res.status(206);
      res.set({
        ...baseHeaders,
        'Content-Range': response.ContentRange,
        'Content-Length': String(response.ContentLength ?? 0),
      });
    } else {
      // Sin rango (o SeaweedFS no devolvió ContentRange): archivo completo
      res.status(200);
      if (response.ContentLength) {
        res.set({ ...baseHeaders, 'Content-Length': String(response.ContentLength) });
      } else {
        res.set(baseHeaders);
      }
    }

    // Stream del archivo
    const stream = response.Body as NodeJS.ReadableStream;
    stream.pipe(res);

  } catch (err: any) {
    console.error('[PROXY] Error:', err.message);
    if (!res.headersSent) {
      res.status(404).json({ success: false, error: 'File not found' });
    }
  }
});

export default router;
