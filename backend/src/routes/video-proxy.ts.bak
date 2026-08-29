import { Router, Response } from 'express';
import { AuthRequest } from '../types';
import { getFileStream, BUCKET_NAME } from '../services/storage';

const router = Router();

// =====================================================
// SeaweedFS Video/File Proxy
// =====================================================

/**
 * GET /api/storage/:path(*)
 * Proxy para archivos de video y otros desde SeaweedFS
 */
router.get('/:path(*)', async (req: AuthRequest, res: Response) => {
  try {
    const filePath = req.params.path;
    
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
    
    // Configurar headers
    res.set('Content-Type', contentType);
    res.set('Accept-Ranges', 'bytes');
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Access-Control-Allow-Origin', '*');
    
    // Si hay Content-Length, incluirlo
    if (response.ContentLength) {
      res.set('Content-Length', String(response.ContentLength));
    }
    
    // Stream del archivo
    const stream = response.Body as NodeJS.ReadableStream;
    stream.pipe(res);
    
  } catch (err: any) {
    console.error('❌ Error streaming file from SeaweedFS:', err.message);
    res.status(404).json({ success: false, error: 'File not found' });
  }
});

export default router;
