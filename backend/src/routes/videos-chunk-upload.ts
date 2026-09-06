import { Router, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { execSync } from 'child_process';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { query } from '../db';
import { uploadStream, getPublicUrl } from '../services/storage';
import { internalError } from '../utils/http';

const router = Router();

// =========================================
// CHUNKED UPLOAD: subida de videos largos por partes
// =========================================
// El frontend graba con MediaRecorder (timeslice) y sube N chunks a
// POST /upload-chunk. Al detener, llama a POST /upload-complete que
// concatena, remuxea (ffmpeg -c copy), sube a SeaweedFS e inserta en BD.

// Directorio raíz temporal de chunks: <os.tmpdir()>/chunk-uploads/<uploadId>/
const CHUNK_ROOT = path.join(os.tmpdir(), 'chunk-uploads');

// Multer para chunks: diskStorage a un subdir por uploadId, ~25MB por chunk,
// guardado como <chunkIndex>.part. Nunca en RAM.
const chunkUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const uploadId = String(req.body?.uploadId || '').trim();
      if (!uploadId) {
        cb(new Error('uploadId es requerido'), '');
        return;
      }
      const dir = path.join(CHUNK_ROOT, uploadId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, _file, cb) => {
      const chunkIndex = parseInt(String(req.body?.chunkIndex), 10);
      if (Number.isNaN(chunkIndex) || chunkIndex < 0) {
        cb(new Error('chunkIndex invalido'), '');
        return;
      }
      cb(null, `${chunkIndex}.part`);
    },
  }),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB por chunk
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    console.log('[CHUNK] Recibido chunk:', file.originalname, 'mimetype:', file.mimetype);
    cb(null, true);
  },
});

// POST /api/videos/upload-chunk - Sube UN chunk del video
// multipart: uploadId, chunkIndex, totalChunks, filename, mimeType, file
router.post('/upload-chunk', authenticate, chunkUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const uploadId = String(req.body?.uploadId || '').trim();
    const chunkIndex = parseInt(String(req.body?.chunkIndex), 10);
    const totalChunks = parseInt(String(req.body?.totalChunks), 10);

    if (!uploadId) {
      res.status(400).json({ success: false, error: 'uploadId es requerido' });
      return;
    }
    if (Number.isNaN(chunkIndex) || chunkIndex < 0) {
      res.status(400).json({ success: false, error: 'chunkIndex invalido' });
      return;
    }
    if (Number.isNaN(totalChunks) || totalChunks <= 0) {
      res.status(400).json({ success: false, error: 'totalChunks invalido' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No se recibio el chunk (campo file)' });
      return;
    }

    // Idempotente: multer ya sobrescribio <chunkIndex>.part si existia
    console.log(`[CHUNK] Chunk ${chunkIndex}/${totalChunks} guardado: ${req.file.path} (${req.file.size} bytes)`);

    res.json({
      success: true,
      data: { uploadId, received: chunkIndex, totalChunks },
    });
  } catch (err: any) {
    console.error('[CHUNK] Error guardando chunk:', err);
    if (err?.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ success: false, error: 'Chunk excede el limite de 25MB' });
      return;
    }
    if (err?.message === 'uploadId es requerido' || err?.message === 'chunkIndex invalido') {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    internalError(res, err);
  }
});
// POST /api/videos/upload-complete - Ensambla todos los chunks y publica el video
// Body (multipart o json): uploadId, totalChunks, title, description?, duration_seconds?
router.post('/upload-complete', authenticate, async (req: AuthRequest, res: Response) => {
  const uploadId = String(req.body?.uploadId || '').trim();
  const totalChunks = parseInt(String(req.body?.totalChunks), 10);
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const bodyDuration = parseInt(String(req.body?.duration_seconds || ''), 10);

  if (!uploadId) {
    res.status(400).json({ success: false, error: 'uploadId es requerido' });
    return;
  }
  if (Number.isNaN(totalChunks) || totalChunks <= 0) {
    res.status(400).json({ success: false, error: 'totalChunks invalido' });
    return;
  }
  if (!title) {
    res.status(400).json({ success: false, error: 'El titulo es requerido' });
    return;
  }

  const chunkDir = path.join(CHUNK_ROOT, uploadId);

  // 1) Verificar que existan todos los chunks 0..totalChunks-1
  if (!fs.existsSync(chunkDir)) {
    res.status(400).json({ success: false, error: 'No existe el uploadId: ' + uploadId });
    return;
  }
  const missing: number[] = [];
  for (let i = 0; i < totalChunks; i++) {
    if (!fs.existsSync(path.join(chunkDir, `${i}.part`))) missing.push(i);
  }
  if (missing.length > 0) {
    console.log(`[CHUNK] Faltan chunks ${missing.join(',')} de ${uploadId}`);
    res.status(400).json({ success: false, error: 'Faltan chunks: ' + missing.join(','), missing });
    return;
  }
  console.log(`[CHUNK] Todos los chunks presentes (${totalChunks}) para ${uploadId}`);

  // 2) Concatenar en orden a un archivo temporal
  const concatPath = path.join(os.tmpdir(), `concat-${uploadId}-${Date.now()}.webm`);

  const userId = req.user!.id;
  const userOrg = await query(
    'SELECT org_id FROM org_members WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  if (userOrg.rows.length === 0) {
    res.status(400).json({ success: false, error: 'Usuario no asociado a ninguna organizacion' });
    return;
  }
  const orgId = userOrg.rows[0].org_id;

  const storageKey = `videos/${orgId}/${Date.now()}.webm`;
  let uploadPath = concatPath;
  let uploadSize = 0;
  let totalBytes = 0;
  let ffprobeDuration = 0;
  try {
    const out = fs.createWriteStream(concatPath);
    // Concatenar chunks en orden con STREAMING REAL: cada parte se encadena con
    // pipe() y se espera su evento 'end' (el backpressure de pipe garantiza que
    // los datos ya fluyeron al write stream). Nunca se lee un chunk completo a
    // RAM: un video de 2GB en ~25MB/chunk no satura la memoria del proceso.
    const pipeChunk = (chunkPath: string) =>
      new Promise<void>((resolve, reject) => {
        const rs = fs.createReadStream(chunkPath);
        rs.on('error', reject);
        // 'end' de rs se emite tras drenar todos sus datos al write stream (pipe
        // respeta backpressure), así que es seguro pasar al siguiente chunk.
        rs.on('end', resolve);
        rs.pipe(out, { end: false });
      });
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(chunkDir, `${i}.part`);
      const stat = fs.statSync(chunkPath);
      totalBytes += stat.size;
      await pipeChunk(chunkPath);
    }
    await new Promise<void>((resolve, reject) => {
      out.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });
    uploadSize = totalBytes;
    console.log(`[CHUNK] Concatenados ${totalChunks} chunks: ${concatPath} (${uploadSize} bytes)`);

    // 3) Remux ffmpeg -c copy + ffprobe (misma logica que /upload)
    const fileExtension = 'webm';
    const fixedPath = `${concatPath}.fixed.${fileExtension}`;
    execSync(`ffmpeg -y -i "${concatPath}" -c copy -f ${fileExtension} "${fixedPath}" 2>/dev/null`);
    const probe = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${fixedPath}"`).toString().trim();
    ffprobeDuration = Math.round(parseFloat(probe) || 0);
    uploadPath = fixedPath;
    uploadSize = fs.statSync(fixedPath).size;
    console.log(`[CHUNK] ffmpeg remux OK: duracion real ${ffprobeDuration}s (${uploadSize} bytes)`);
  } catch (err: any) {
    console.warn('[CHUNK] ffmpeg remux fallo, se usa el archivo concatenado:', err.message);
  }

  // 4) Subir a SeaweedFS con uploadStream
  console.log('[CHUNK] Subiendo a SeaweedFS:', storageKey, '(' + uploadSize + ' bytes)');
  let uploadResult;
  try {
    const stream = fs.createReadStream(uploadPath);
    uploadResult = await uploadStream(stream, uploadSize, storageKey, 'video/webm');
  } finally {
    fs.unlink(concatPath, () => {});
    if (uploadPath !== concatPath) fs.unlink(uploadPath, () => {});
  }
  console.log('[CHUNK] Subido exitosamente:', uploadResult.url);

  // 5) Insertar en BD (mismos campos que /upload)
  const metadata = {
    original_name: '',
    mime_type: 'video/webm',
    size: uploadSize,
    storage_key: storageKey,
    public_url: uploadResult.url,
    chunked: true,
    upload_id: uploadId,
  };

  const fallbackDuration = Math.floor(uploadSize / 1000000);
  const finalDuration = ffprobeDuration || bodyDuration || fallbackDuration || 0;
  console.log(`[CHUNK] Duracion final: ${finalDuration}s (ffprobe: ${ffprobeDuration}, body: ${bodyDuration}, fallback: ${fallbackDuration})`);

  const result = await query(
    `INSERT INTO videos (org_id, title, description, storage_key, duration_seconds, metadata, created_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ready')
     RETURNING *`,
    [orgId, title, description, storageKey, finalDuration, JSON.stringify(metadata), userId]
  );
  const video = result.rows[0];

  // 6) Limpiar el directorio temporal de chunks
  try {
    fs.rmSync(chunkDir, { recursive: true, force: true });
    console.log('[CHUNK] Directorio temporal limpiado:', chunkDir);
  } catch (cleanErr: any) {
    console.warn('[CHUNK] No se pudo limpiar el dir temporal:', cleanErr.message);
  }

  res.status(201).json({
    success: true,
    data: { video, upload_url: uploadResult.url },
  });
});

export default router;
