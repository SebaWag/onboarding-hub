# Onboarding Hub - WagnerSolutionsAI

> Plataforma de onboarding corporativo con grabacion de tutoriales, IA y gestion de contenido.

## Stack Tecnologico

| Capa | Tecnologia |
|------|------------|
| Frontend | React 19 + Vite + TypeScript + Tailwind CSS |
| Backend | Node.js 20 + Express + TypeScript |
| DB | PostgreSQL 15 |
| Cache | Redis 7 |
| Storage | MinIO (S3-compatible) |
| Proxy | Traefik v2.11 (SSL + reverse proxy) |
| AI | BodyPix (segmentacion) + Whisper (transcripcion) |

## Servicios (Docker)

| Servicio | Puerto | Container |
|----------|--------|-----------|
| Frontend | 8090 | onboarding-hub-frontend |
| Backend | 4001 | onboarding-hub-backend |
| PostgreSQL | 5435 | onboarding-hub-postgres |
| Redis | 6381 | onboarding-hub-redis |
| MinIO | 9000 | minio |
| Traefik | 80/443 | traefik |

## Dominios

| Dominio | Servicio | SSL |
|---------|----------|-----|
| academy.wagnersolutionsai.com | Frontend (Onboarding Hub) | Let's Encrypt |
| traefik.wagnersolutionsai.com | Dashboard Traefik | Let's Encrypt |

## Features

- Grabacion de pantalla + camara (picture-in-picture circular)
- Fondo virtual (Matrix Rain, colores solidos, blur)
- Deteccion de piel para background removal (sin IA externa)
- Biblioteca con busqueda, vista grid/lista
- Renombrar videos
- Generar portada con ffmpeg
- Eliminar videos
- Reproductor con chat IA contextual
- Transcripcion con Whisper
- Dashboard con KPIs
- Programas de onboarding
- Tablero Kanban
- Tema claro/oscuro
- Diseno responsive
- Autenticacion JWT
- Almacenamiento S3 (MinIO)

## Comandos

```bash
# Iniciar servicios
cd /opt/stacks/onboarding-hub && docker compose up -d

# Rebuild frontend
docker compose build --no-cache frontend
docker compose up -d --force-recreate frontend

# Logs
docker compose logs -f backend

# DB
docker compose exec postgres psql -U admin -d onboarding_hub
```

## Diseno (Loom-style)

- **Paleta**: Fondo blanco, acento teal (#0d9488)
- **Sidebar**: 48px minimalista
- **Cards**: Bordes sutiles, radios 12px
- **Tipografia**: Inter
- **Logo**: WS (WagnerSolutions) con gradiente 3D animado

## Estructura

```
backend/src/routes/
  auth.ts, videos.ts, videos-upload.ts, analytics.ts,
  chat.ts, programs.ts, kanban.ts, comments.ts, ...

frontend/src/
  components/  Layout, CameraPreview, BackgroundSelector, ...
  pages/       Studio, Library, Dashboard, Programs, Kanban, ...
  hooks/       useMediaRecorder, useBackgroundRemoval, ...
```

---

*Documentacion actualizada al 28 de Abril 2026*
