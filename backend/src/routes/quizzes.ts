import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { query } from '../db';

const router = Router();

// GET /api/quizzes/content/:contentId - Obtener quiz por content_id
router.get('/content/:contentId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { contentId } = req.params;
    const userId = req.user!.id;

    const contentCheck = await query(
      `SELECT c.id, p.org_id 
       FROM contents c
       JOIN modules m ON c.module_id = m.id
       JOIN programs p ON m.program_id = p.id
       LEFT JOIN org_members om ON p.org_id = om.org_id AND om.user_id = $1
       WHERE c.id = $2 AND om.user_id IS NOT NULL`,
      [userId, contentId]
    );

    if (contentCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Content not found or access denied' });
      return;
    }

    const result = await query(
      `SELECT q.*, c.title as content_title
       FROM quizzes q
       JOIN contents c ON q.content_id = c.id
       WHERE q.content_id = $1`,
      [contentId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Quiz not found for this content' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/quizzes - Crear nuevo quiz
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { content_id, title, passing_score, max_attempts, questions } = req.body;
    const userId = req.user!.id;

    if (!content_id || !questions || !Array.isArray(questions)) {
      res.status(400).json({ success: false, error: 'Content ID and questions array are required' });
      return;
    }

    const contentCheck = await query(
      `SELECT c.id, om.org_role 
       FROM contents c
       JOIN modules m ON c.module_id = m.id
       JOIN programs p ON m.program_id = p.id
       LEFT JOIN org_members om ON p.org_id = om.org_id AND om.user_id = $1
       WHERE c.id = $2`,
      [userId, content_id]
    );

    if (contentCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Content not found' });
      return;
    }

    const content = contentCheck.rows[0];
    if (!content.org_role || !['admin', 'owner'].includes(content.org_role)) {
      res.status(403).json({ success: false, error: 'Only admins can create quizzes' });
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question || !q.options || !Array.isArray(q.options) || q.correct_answer === undefined) {
        res.status(400).json({ 
          success: false, 
          error: `Invalid question structure at index ${i}. Required: question, options array, correct_answer` 
        });
        return;
      }
    }

    const existingQuiz = await query(
      'SELECT id FROM quizzes WHERE content_id = $1',
      [content_id]
    );

    if (existingQuiz.rows.length > 0) {
      res.status(409).json({ success: false, error: 'A quiz already exists for this content' });
      return;
    }

    const result = await query(
      `INSERT INTO quizzes (content_id, title, passing_score, max_attempts, questions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        content_id,
        title || 'Quiz',
        passing_score || 70,
        max_attempts || 3,
        JSON.stringify(questions)
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/quizzes/:id/submit - Enviar respuestas de quiz
router.post('/:id/submit', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;
    const userId = req.user!.id;

    if (!answers || !Array.isArray(answers)) {
      res.status(400).json({ success: false, error: 'Answers array is required' });
      return;
    }

    const quizResult = await query(
      `SELECT q.*, c.module_id, p.org_id, p.id as program_id
       FROM quizzes q
       JOIN contents c ON q.content_id = c.id
       JOIN modules m ON c.module_id = m.id
       JOIN programs p ON m.program_id = p.id
       WHERE q.id = $1`,
      [id]
    );

    if (quizResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Quiz not found' });
      return;
    }

    const quiz = quizResult.rows[0];

    const memberCheck = await query(
      'SELECT 1 FROM org_members WHERE user_id = $1 AND org_id = $2',
      [userId, quiz.org_id]
    );
    if (memberCheck.rows.length === 0) {
      res.status(403).json({ success: false, error: 'Access denied to this quiz' });
      return;
    }

    const attempts = await query(
      `SELECT COUNT(*) as attempt_count
       FROM user_progress
       WHERE user_id = $1 AND content_id = $2 AND status = 'completed'`,
      [userId, quiz.content_id]
    );

    const attemptCount = parseInt(attempts.rows[0].attempt_count);
    if (attemptCount >= quiz.max_attempts) {
      res.status(400).json({ 
        success: false, 
        error: `Maximum attempts reached (${quiz.max_attempts})` 
      });
      return;
    }

    if (answers.length !== quiz.questions.length) {
      res.status(400).json({ 
        success: false, 
        error: `Expected ${quiz.questions.length} answers, got ${answers.length}` 
      });
      return;
    }

    let correctCount = 0;
    const results = quiz.questions.map((question: any, index: number) => {
      const userAnswer = answers[index];
      const isCorrect = userAnswer === question.correct_answer;
      if (isCorrect) correctCount++;

      return {
        question_index: index,
        question: question.question,
        user_answer: userAnswer,
        correct_answer: question.correct_answer,
        is_correct: isCorrect,
        options: question.options
      };
    });

    const score = Math.round((correctCount / quiz.questions.length) * 100);
    const passed = score >= quiz.passing_score;

    await query(
      `INSERT INTO user_progress (user_id, program_id, module_id, content_id, status, score, metadata)
       VALUES ($1, $2, $3, $4, 'completed', $5, $6)`,
      [
        userId,
        quiz.program_id,
        quiz.module_id,
        quiz.content_id,
        score,
        JSON.stringify({
          attempt_number: attemptCount + 1,
          answers: results,
          passed,
          completed_at: new Date().toISOString()
        })
      ]
    );

    res.json({
      success: true,
      data: {
        score,
        passed,
        correct_count: correctCount,
        total_questions: quiz.questions.length,
        passing_score: quiz.passing_score,
        results,
        attempt_number: attemptCount + 1,
        attempts_remaining: quiz.max_attempts - attemptCount - 1
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
