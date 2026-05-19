import { Router, Response } from 'express'
import { authenticate } from '../middleware/auth'
import { AuthRequest } from '../types'
import { query } from '../db'

const router = Router()

// GET /api/videos/:videoId/comments
router.get('/:videoId/comments', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { videoId } = req.params
    const userId = req.user!.id

    // Verify access
    const videoCheck = await query(
      `SELECT v.id FROM videos v
       LEFT JOIN org_members om ON v.org_id = om.org_id AND om.user_id = $1
       WHERE v.id = $2 AND om.user_id IS NOT NULL`,
      [userId, videoId]
    )
    if (videoCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Video not found' })
      return
    }

    const result = await query(
      `SELECT vc.*, u.name as user_name, u.avatar_url as user_avatar
       FROM video_comments vc
       LEFT JOIN users u ON vc.user_id = u.id
       WHERE vc.video_id = $1
       ORDER BY vc.created_at ASC`,
      [videoId]
    )

    res.json({ success: true, data: result.rows })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/videos/:videoId/comments
router.post('/:videoId/comments', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { videoId } = req.params
    const { content, timestamp_seconds, parent_id } = req.body
    const userId = req.user!.id

    if (!content || !content.trim()) {
      res.status(400).json({ success: false, error: 'Content is required' })
      return
    }

    // Verify access
    const videoCheck = await query(
      `SELECT v.id FROM videos v
       LEFT JOIN org_members om ON v.org_id = om.org_id AND om.user_id = $1
       WHERE v.id = $2 AND om.user_id IS NOT NULL`,
      [userId, videoId]
    )
    if (videoCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Video not found' })
      return
    }

    const result = await query(
      `INSERT INTO video_comments (video_id, user_id, content, timestamp_seconds, parent_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [videoId, userId, content.trim(), timestamp_seconds, parent_id]
    )

    // Get user info
    const comment = result.rows[0]
    const userInfo = await query('SELECT name, avatar_url FROM users WHERE id = $1', [userId])
    comment.user_name = userInfo.rows[0]?.name
    comment.user_avatar = userInfo.rows[0]?.avatar_url

    res.status(201).json({ success: true, data: comment })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// PATCH /api/videos/:videoId/comments/:commentId
router.patch('/:videoId/comments/:commentId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { commentId } = req.params
    const { is_resolved, content } = req.body
    const userId = req.user!.id

    const updates: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (is_resolved !== undefined) {
      updates.push(`is_resolved = $${paramIndex}`)
      params.push(is_resolved)
      paramIndex++
    }
    if (content !== undefined) {
      updates.push(`content = $${paramIndex}`)
      params.push(content)
      paramIndex++
    }

    updates.push(`updated_at = now()`)
    params.push(commentId)

    const result = await query(
      `UPDATE video_comments SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    )

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Comment not found' })
      return
    }

    res.json({ success: true, data: result.rows[0] })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// DELETE /api/videos/:videoId/comments/:commentId
router.delete('/:videoId/comments/:commentId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { commentId } = req.params
    const userId = req.user!.id

    // Only allow owner or admin to delete
    const commentCheck = await query(
      `SELECT vc.user_id, om.org_role
       FROM video_comments vc
       JOIN videos v ON vc.video_id = v.id
       LEFT JOIN org_members om ON v.org_id = om.org_id AND om.user_id = $1
       WHERE vc.id = $2`,
      [userId, commentId]
    )

    if (commentCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Comment not found' })
      return
    }

    const comment = commentCheck.rows[0]
    if (comment.user_id !== userId && !['admin', 'owner'].includes(comment.org_role)) {
      res.status(403).json({ success: false, error: 'No permission to delete this comment' })
      return
    }

    await query('DELETE FROM video_comments WHERE id = $1', [commentId])
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
