import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

import { errorHandler } from './middleware/errorHandler';
import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import programsRoutes from './routes/programs';
import modulesRoutes from './routes/modules';
import contentsRoutes from './routes/contents';
import videosRoutes from './routes/videos';
import videosUploadRoutes from './routes/videos-upload';
import videosProcessRoutes from './routes/videos-process';
import quizzesRoutes from './routes/quizzes';
import commentsRoutes from './routes/comments';
import flowsRoutes from './routes/flows';
import templatesRoutes from './routes/templates';
import resourcesRoutes from './routes/resources';
import kanbanRoutes from './routes/kanban';
import videoProxyRoutes from './routes/video-proxy';
import analyticsRoutes from './routes/analytics';
import usersRoutes from './routes/users';
import videoInteractionsRoutes from './routes/video-interactions';

const app = express();
const PORT = process.env.PORT || 4001;

// SeaweedFS configuration (S3-compatible)
const SEAWEEDFS_ENDPOINT = process.env.SEAWEEDFS_ENDPOINT || 'localhost';
const SEAWEEDFS_PORT = process.env.SEAWEEDFS_PORT || '8333';
const SEAWEEDFS_PUBLIC_URL = process.env.SEAWEEDFS_PUBLIC_URL || 'http://localhost:9006';

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:8090'],
  credentials: true,
}));
app.use(express.json({ limit: '2gb' }));
app.use(express.urlencoded({ extended: true, limit: '2gb' }));
app.use(morgan('short'));

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/programs', programsRoutes);
app.use('/api/modules', modulesRoutes);
app.use('/api/contents', contentsRoutes);
app.use('/api/videos', videoInteractionsRoutes);
app.use('/api/videos', videosUploadRoutes);
app.use('/api/videos', videosProcessRoutes);
app.use('/api/videos', commentsRoutes);
app.use('/api/videos', videosRoutes);
app.use('/api/quizzes', quizzesRoutes);
app.use('/api/flows', flowsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/resources', resourcesRoutes);
app.use('/api/kanban', kanbanRoutes);
app.use('/api/storage', videoProxyRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/users', usersRoutes);

// Root
app.get('/', (req, res) => {
  res.json({
    name: 'OnboardingHub API',
    version: '1.4.0',
    status: 'running',
    services: {
      whisper: process.env.WHISPER_URL || 'http://localhost:8178',
      seaweedfs: `${SEAWEEDFS_ENDPOINT}:${SEAWEEDFS_PORT}`,
      seaweedfs_public: SEAWEEDFS_PUBLIC_URL,
      mimo: process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1',
    },
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      chat: '/api/chat',
      programs: '/api/programs',
      modules: '/api/modules',
      contents: '/api/contents',
      videos: '/api/videos',
      quizzes: '/api/quizzes',
      flows: '/api/flows',
      templates: '/api/templates',
      resources: '/api/resources',
      kanban: '/api/kanban',
      analytics: '/api/analytics',
      users: '/api/users',
    },
  });
});

// Error handler
app.use(errorHandler);

// Start
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║         OnboardingHub API v1.4          ║
  ║         Port: ${PORT}                        ║
  ╠═══════════════════════════════════════════╣
  ║  Services:                                ║
  ║  • Whisper: ${(process.env.WHISPER_URL || 'http://localhost:8178').substring(0, 30)}
  ║  • SeaweedFS: ${(SEAWEEDFS_ENDPOINT + ':' + SEAWEEDFS_PORT).substring(0, 28)}
  ║  • MiMo: ${(process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1').substring(0, 30)}
  ╠═══════════════════════════════════════════╣
  ║  New in v1.4:                             ║
  ║  • SeaweedFS migration complete          ║
  ║  • S3-compatible storage client          ║
  ╚═══════════════════════════════════════════╝
  `);
});

export default app;
