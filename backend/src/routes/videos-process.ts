import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { query } from '../db';
import { whisperService } from '../services/whisper';
import { downloadFile, uploadSubtitles } from '../services/storage';
import fs from 'fs';
import path from 'path';

const router = Router();

// POST /api/videos/:id/process - Process video with Whisper
router.post('/:id/process', authenticate, async (req: AuthRequest, res: Response) => {
  const videoId = req.params.id;
  const userId = req.user!.id;
  const tempDir = '/tmp/video-processing';

  try {
    const videoResult = await query(
      `SELECT v.*, om.org_role
       FROM videos v
       LEFT JOIN org_members om ON v.org_id = om.org_id AND om.user_id = $1
       WHERE v.id = $2`,
      [userId, videoId]
    );

    if (videoResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Video not found' });
      return;
    }

    const video = videoResult.rows[0];

    if (video.created_by !== userId && !['admin', 'owner'].includes(video.org_role)) {
      res.status(403).json({ success: false, error: 'No permission to process this video' });
      return;
    }

    await query(`UPDATE videos SET status = 'transcribing' WHERE id = $1`, [videoId]);
    console.log(`Starting transcription for video: ${videoId}`);

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const videoPath = path.join(tempDir, `${videoId}.webm`);

    try {
      // Download video from SeaweedFS
      await downloadFile(video.storage_key, videoPath);
      console.log(`Video downloaded: ${videoPath}`);

      // Transcribe with Whisper
      const transcription = await whisperService.transcribeVideo(videoPath);
      console.log(`Transcription complete: ${transcription.segments.length} segments`);

      // Generate chapters
      const chapters = whisperService.generateChapters(transcription.segments);
      console.log(`Generated ${chapters.length} chapters`);

      // Try to upload subtitles (non-blocking)
      let subtitlesKey: string | null = null;
      try {
        const srt = whisperService.generateSRT(transcription.segments);
        const subtitlesResult = await uploadSubtitles(srt, videoId);
        subtitlesKey = subtitlesResult.key;
        console.log(`Subtitles uploaded: ${subtitlesKey}`);
      } catch (srtErr: any) {
        console.warn(`Warning: Could not upload subtitles: ${srtErr.message}`);
      }

      // Save to database
      await query(
        `UPDATE videos 
         SET status = 'ready',
             transcript = $1,
             transcript_segments = $2,
             subtitles_url = $3,
             duration_seconds = $4,
             metadata = jsonb_set(COALESCE(metadata, '{}'), '{chapters}', $5)
         WHERE id = $6`,
        [
          transcription.text,
          JSON.stringify(transcription.segments),
          subtitlesKey,
          Math.round(transcription.duration),
          JSON.stringify(chapters),
          videoId,
        ]
      );

      console.log(`Video ${videoId} transcription saved to DB`);

      // Cleanup temp file
      if (fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      res.json({
        success: true,
        data: {
          transcript: transcription.text,
          segments: transcription.segments,
          chapters,
          duration: transcription.duration,
          subtitles_url: subtitlesKey,
        },
      });
    } catch (error: any) {
      console.error(`Transcription failed for ${videoId}:`, error.message);
      await query(
        `UPDATE videos SET status = 'failed', metadata = jsonb_set(COALESCE(metadata, '{}'), '{error}', $1) WHERE id = $2`,
        [JSON.stringify(error.message), videoId]
      );
      // Cleanup
      if (fs.existsSync(videoPath)) {
        try { fs.unlinkSync(videoPath); } catch (e) {}
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Video processing error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/videos/:id/transcript - Get video transcript
router.get('/:id/transcript', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const videoId = req.params.id;
    const userId = req.user!.id;

    const result = await query(
      `SELECT v.transcript, v.transcript_segments, v.subtitles_url, v.duration_seconds, v.metadata
       FROM videos v
       LEFT JOIN org_members om ON v.org_id = om.org_id AND om.user_id = $1
       WHERE v.id = $2 AND om.user_id IS NOT NULL`,
      [userId, videoId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Video not found' });
      return;
    }

    const video = result.rows[0];

    res.json({
      success: true,
      data: {
        transcript: video.transcript,
        segments: video.transcript_segments,
        subtitles_url: video.subtitles_url,
        duration: video.duration_seconds,
        chapters: video.metadata?.chapters || [],
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
