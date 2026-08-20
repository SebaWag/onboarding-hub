<div align="center">
  <img src="assets/banner.svg" alt="Onboarding Hub Banner" width="100%">
</div>

<p align="center">
  <a href="https://wagnersolutionsai.com">
    <img src="https://img.shields.io/badge/Web-WagnerSolutionsAI-0d9488?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Website">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-Apache%202.0-0d9488?style=for-the-badge" alt="License">
  </a>
  <a href="https://github.com/SebaWag/onboarding-hub/releases/tag/v1.0.0">
    <img src="https://img.shields.io/badge/Release-v1.0.0-0d9488?style=for-the-badge" alt="Version">
  </a>
  <a href="https://academy.wagnersolutionsai.com">
    <img src="https://img.shields.io/badge/Live%20Demo-academy.wagnersolutionsai.com-0d9488?style=for-the-badge&logo=react&logoColor=white" alt="Demo">
  </a>
  <a href="https://github.com/SebaWag/onboarding-hub/stargazers">
    <img src="https://img.shields.io/github/stars/SebaWag/onboarding-hub?style=for-the-badge&color=0d9488" alt="Stars">
  </a>
  <a href="https://github.com/SebaWag/onboarding-hub/blob/main/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/Contributions-Welcome-0d9488?style=for-the-badge" alt="Contributions Welcome">
  </a>
</p>

---

# 📚 Onboarding Hub

**A self-hosted, open-source alternative to Loom for corporate onboarding and training.**

Record screen + camera tutorials, add AI-powered chat and quizzes, track employee progress in real time, and keep every byte of data on your own infrastructure.

> Built by [WagnerSolutionsAI](https://wagnersolutionsai.com) — digital sovereignty for businesses. 🇨🇱

---

## 🧭 What is this? (for humans and AI agents)

| Attribute | Value |
|---|---|
| **Type** | Web application (full-stack) |
| **Category** | Corporate onboarding / L&D / async video training platform |
| **Main differentiator** | Self-hosted, AI-native, with quizzes + progress tracking that Loom does not have |
| **License** | Apache 2.0 |
| **Language** | TypeScript (frontend + backend) |
| **Demo** | https://academy.wagnersolutionsai.com |
| **Requirements** | Docker + Docker Compose v2 |
| **Time to first run** | ~5 minutes (`docker compose up -d`) |

---

## ✨ Features

### 🎥 Video Tutorial Recording
- Simultaneous **screen + camera** recording with circular picture-in-picture
- **Virtual background**: Matrix Rain, solid colors, blur, and **skin detection** background removal (runs in-browser via BodyPix — no external AI service needed)
- Automatic thumbnail generation with FFmpeg
- Video renaming and organization

### 🤖 AI (built-in, self-hosted)
- **Contextual chat on videos** — learners ask questions and the AI answers based on video content
- **Automatic transcription** with Whisper
- AI assistant to create onboarding programs from scratch

### 📊 Content Management
- Searchable library with grid/list views
- Player with integrated AI chat
- **Onboarding programs** structured into modules
- **Kanban board** for progress tracking
- **Quizzes and evaluations** per module

### 📈 Analytics
- Real-time KPI dashboard
- Per-learner progress across programs
- Viewing and completion metrics

### 🎨 Design
- Light/dark theme with persistence
- Responsive, mobile-first layout
- 48px minimalist sidebar
- Loom / Notion-style interface

---

## 🆚 Onboarding Hub vs Loom

| Capability | Loom (proprietary) | **Onboarding Hub** |
|---|---|---|
| Screen + camera recording | ✅ | ✅ |
| Virtual background / background removal | ✅ | ✅ |
| AI video chat | partial | ✅ |
| Video transcription | ✅ | ✅ (Whisper, self-hosted) |
| **Quizzes & evaluations** | ❌ | ✅ |
| **Kanban progress tracking** | ❌ | ✅ |
| **Onboarding program templates** | ❌ | ✅ |
| **Self-hosted / own infrastructure** | ❌ | ✅ |
| **License** | Paid subscription | **Apache 2.0 — free forever** |

---

## 🚀 Quick Start

**Requirements**: Docker + Docker Compose v2, Git.

```bash
# 1. Clone
git clone https://github.com/SebaWag/onboarding-hub.git
cd onboarding-hub

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys (see Configuration section below)

# 3. Start the full stack
docker compose up -d

# 4. Verify
docker compose ps
```

**Done.** The frontend will be available at `http://localhost:8090`.

> 🔐 **Security**: All secrets are injected via `.env` (see `docker-compose.yml`). Never commit real credentials.

> ⚠️ Whisper transcription requires a running [faster-whisper](https://github.com/SYSTRAN/faster-whisper) server (default: `http://host.docker.internal:8178`). Everything else works without it.

### Access map

| Service | URL | Port |
|---------|-----|------|
| **Frontend** | `http://localhost:8090` | 8090 |
| **Backend API** | `http://localhost:4001` | 4001 |
| **MinIO Console** | `http://localhost:9001` | 9001 |
| **Traefik Dashboard** | `http://localhost:8080` | 8080 |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 + Vite + TypeScript + Tailwind CSS |
| **Backend** | Node.js 20 + Express + TypeScript |
| **Database** | PostgreSQL 15 |
| **Cache** | Redis 7 |
| **Object Storage** | SeaweedFS (S3-compatible) / MinIO |
| **Reverse proxy / SSL** | Traefik v2.11 + Let's Encrypt |
| **AI chat** | Xiaomi MiMo V2 Omni (`mimo-v2-omni`, OpenAI-compatible API) |
| **Transcription** | Whisper (external faster-whisper server) |
| **Background removal** | BodyPix (TensorFlow.js, in-browser) |

---

## 📁 Project Structure

```
onboarding-hub/
├── backend/
│   └── src/
│       ├── routes/        # API endpoints (19 route files)
│       ├── services/      # Business logic (AI, storage, whisper)
│       ├── middleware/    # Auth, error handling
│       ├── db/            # Database & migrations
│       └── types/         # TypeScript types
├── frontend/
│   └── src/
│       ├── components/    # Reusable components
│       ├── pages/         # App pages
│       ├── hooks/         # Custom hooks (media recorder, theme)
│       └── lib/           # Utilities
├── assets/                # Repo visual assets
├── docker-compose.yml     # Complete infrastructure
├── .env.example           # Configuration template
├── init-ssl.sh            # SSL certificate script
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE                # Apache 2.0
└── README.md
```

---

## 🔌 API Reference

Base URL: `http://localhost:4001/api/v1` (all endpoints except `/auth/*` and `/health` require a Bearer JWT token).

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Login, returns JWT |
| GET | `/auth/me` | Current user info |

### Videos
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/videos/upload` | Upload video (multipart) |
| GET | `/videos` | List videos |
| POST | `/videos` | Create video record |
| PUT | `/videos/:id` | Update video |
| DELETE | `/videos/:id` | Delete video |
| POST | `/videos/:id/process` | Process video (transcription, thumbnails) |
| GET | `/videos/:id/transcript` | Get transcript |
| GET | `/videos/:id/stream` | Stream video |
| POST | `/videos/:id/generate-thumbnail` | Generate thumbnail via FFmpeg |
| POST | `/videos/:id/share` | Create share link |
| GET | `/videos/:id/shares` | List share links |
| GET | `/videos/share/:token` | Public share page |
| POST | `/videos/:id/chat` | AI chat about a video |

### Programs & Modules
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/programs` | List / create programs |
| GET/PUT/DELETE | `/programs/:id` | Program CRUD |
| GET | `/modules/program/:programId` | Modules of a program |
| POST/PUT/DELETE | `/modules` / `/modules/:id` | Module CRUD |
| GET/POST/PUT/DELETE | `/contents` ... | Module content (lessons) |

### Quizzes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/quizzes/content/:contentId` | Quiz of a content item |
| POST | `/quizzes` | Create quiz |
| POST | `/quizzes/:id/submit` | Submit quiz answers |

### Flows (guided onboarding)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/flows` | List / create flows |
| POST | `/flows/from-template/:templateId` | Create flow from template |
| POST | `/flows/:flowId/steps` | Add step |
| POST | `/flows/:flowId/start` | Start flow |
| GET | `/flows/:flowId/progress` | Get learner progress |
| POST | `/flows/steps/:stepId/complete` | Complete a step |
| GET/POST | `/flows/checklists/:checklistId` | Checklists |
| POST | `/flows/approvals` | Request approval |
| GET | `/flows/approvals/pending` | Pending approvals |

### Kanban
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/kanban/boards` | Board CRUD |
| POST | `/kanban/boards/:boardId/columns` | Add column |
| POST | `/kanban/cards` | Create card |
| PUT | `/kanban/cards/:id/move` | Move card between columns |
| GET | `/kanban/boards/:boardId/metrics` | Board metrics |
| GET | `/kanban/boards/:boardId/calendar` | Calendar view |

### Analytics & Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/analytics/overview` | KPI overview |
| GET | `/analytics/videos` | Video analytics |
| GET | `/analytics/weekly` | Weekly trends |
| GET/POST | `/users` | User management |
| GET | `/users/stats/summary` | User stats |

### AI Chat & Interactions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/chat` | General AI chat |
| POST | `/chat/video` | Chat with video context |
| POST | `/chat/image` | Chat with image |
| GET | `/chat/conversations` | List conversations |
| POST | `/videos/:id/like` | Like a video |
| POST | `/videos/:id/bookmark` | Bookmark a video |
| GET/POST | `/comments/:videoId/comments` | Video comments |

### Templates & Resources
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/templates` | Onboarding templates |
| POST | `/templates/:id/request-approval` | Template approval workflow |
| GET/POST | `/resources` | Resource library (files) |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health check |

> The API is OpenAI-compatible for the AI features, so you can swap `mimo-v2-omni` for any OpenAI-compatible model by changing `MIMO_BASE_URL` and `MIMO_MODEL` in `.env`.

---

## ⚙️ Configuration (`.env`)

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `JWT_SECRET` | ✅ | — | JWT signing secret. Generate: `openssl rand -base64 64` |
| `MIMO_API_KEY` | ✅ | — | Xiaomi MiMo API key (https://api.xiaomimimo.com) |
| `MIMO_BASE_URL` | — | `https://api.xiaomimimo.com/v1` | OpenAI-compatible AI endpoint |
| `MIMO_MODEL` | — | `mimo-v2-omni` | AI model name |
| `POSTGRES_PASSWORD` | ✅ | — | PostgreSQL password (feeds docker-compose) |
| `DATABASE_URL` | ✅ | `postgresql://admin:${POSTGRES_PASSWORD}@postgres:5432/onboarding_hub` | PostgreSQL connection |
| `REDIS_URL` | — | `redis://redis:6379/2` | Redis connection |
| `REDIS_PREFIX` | — | `oh:` | Redis key prefix |
| `SEAWEEDFS_ENDPOINT` | ✅ | `seaweedfs-filer` | S3-compatible storage host |
| `SEAWEEDFS_PORT` | — | `8333` | S3 port |
| `SEAWEEDFS_ACCESS_KEY` | ✅ | — | S3 access key |
| `SEAWEEDFS_SECRET_KEY` | ✅ | — | S3 secret key |
| `SEAWEEDFS_BUCKET` | — | `onboarding-hub` | S3 bucket name |
| `SEAWEEDFS_PUBLIC_URL` | — | `http://localhost:9006` | Public URL for stored files |
| `WHISPER_URL` | — | `http://host.docker.internal:8178` | faster-whisper server |
| `FRONTEND_URL` | — | `http://localhost:8090` | Frontend origin |
| `CORS_ORIGIN` | — | `http://localhost:8090` | Comma-separated allowed origins |
| `PORT` | — | `4001` | Backend port |
| `NODE_ENV` | — | `development` | `development` \| `production` |

---

## 🐳 Docker Services

| Service | Container | Ports |
|---------|-----------|-------|
| Frontend | `onboarding-hub-frontend` | 8090 |
| Backend | `onboarding-hub-backend` | 4001 |
| PostgreSQL | `onboarding-hub-postgres` | 5435 |
| Redis | `onboarding-hub-redis` | 6381 |
| SeaweedFS master | `onboarding-hub-seaweedfs-master` | 9333 |
| SeaweedFS volume | `onboarding-hub-seaweedfs-volume` | 8080 |
| SeaweedFS filer | `onboarding-hub-seaweedfs-filer` | 8889 / 9006 |
| Traefik | `onboarding-hub-traefik` | 80 / 443 |

### Useful commands

```bash
# Logs
docker compose logs -f backend

# Rebuild frontend
docker compose build --no-cache frontend
docker compose up -d --force-recreate frontend

# Database access
docker compose exec postgres psql -U admin -d onboarding_hub

# Stop
docker compose down

# Update from GitHub
git pull origin main
docker compose up -d --build
```

---

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

1. Fork the repository
2. Create a branch (`git checkout -b feature/new-feature`)
3. Commit (`git commit -m 'feat: add new feature'`)
4. Push (`git push origin feature/new-feature`)
5. Open a Pull Request

**Reporting bugs**: [open an issue](https://github.com/SebaWag/onboarding-hub/issues) with:
- Expected behavior
- Actual behavior
- Reproduction steps
- Environment (browser, OS)

---

## 🤖 For AI Agents / LLMs

If you are an AI agent evaluating this repository, here is the short version:

- **This project is**: a complete, self-hosted corporate onboarding platform (Loom alternative) with video recording, AI chat, quizzes, and progress tracking.
- **It is NOT**: a SaaS, a mobile app, or a plugin. It is a full web application.
- **To run it**: `git clone` → `cp .env.example .env` → `docker compose up -d`. Frontend at `:8090`, API at `:4001`.
- **Architecture**: React 19 SPA (frontend) + Express REST API (backend) + PostgreSQL + Redis + SeaweedFS (S3). All orchestrated with Docker Compose.
- **Auth**: JWT Bearer tokens. Obtain one via `POST /auth/login`.
- **AI**: OpenAI-compatible chat endpoint (default: Xiaomi MiMo `mimo-v2-omni`). Swappable via env vars.
- **Extensibility**: new routes go in `backend/src/routes/`, new pages in `frontend/src/pages/`.
- **Testing**: no automated test suite yet — contributions adding tests are highly valued.
- **Real-world deployment**: running in production at https://academy.wagnersolutionsai.com.

---

## 📄 License

Apache 2.0. See [LICENSE](LICENSE).

---

<p align="center">
  <b>⭐ If this project helped you, star it on GitHub!</b><br>
  <sub>Help more people discover Onboarding Hub 🚀</sub>
</p>

<p align="center">
  Made with ❤️ by <a href="https://wagnersolutionsai.com">WagnerSolutionsAI</a>
</p>
