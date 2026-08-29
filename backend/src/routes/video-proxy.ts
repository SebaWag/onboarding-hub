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
 * Requiere autenticación: header 
 * o query param  (para <video>, <img> y descargas,
 * que no pueden enviar headers personalizados).
 */
// Express 5 / path-to-regexp v8: las wildcards deben ser nombradas ('/*splat').
// El parametro 'splat' captura el resto del path incluyendo barras.
router.get('/*splat', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const filePath = req.params.splat as string;

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

    // Obtener stream desde SeaweedFS
    const response = await getFileStream(filePath);

    // Configurar headers (fix de produccion: CORS abierto + expose headers para range requests)
    res.set({
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    });

    // Si hay Content-Length, incluirlo
    if (response.ContentLength) {
      res.set('Content-Length', String(response.ContentLength));
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
