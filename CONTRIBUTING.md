# 🎯 Guía de Contribución — Onboarding Hub

¡Gracias por tu interés en contribuir a **Onboarding Hub**! Nos encanta recibir ayuda de la comunidad.

## 🧭 ¿Cómo empezar?

### 1. Encuentra algo en qué trabajar
- Revisa los [Issues](https://github.com/SebaWag/onboarding-hub/issues) abiertos
- Si tienes una idea, **abre un issue primero** para discutirla

### 2. Fork & Clone
```bash
git clone https://github.com/tu-usuario/onboarding-hub.git
cd onboarding-hub
cp .env.example .env
docker compose up -d
```

### 3. Crea una rama
```bash
git checkout -b feat/mi-feature
# o
git checkout -b fix/mi-arreglo
```

### 4. Haz tus cambios
- Sigue el estilo del código existente
- Escribe tests cuando sea posible
- Actualiza el README si es necesario

### 5. Commit
Usamos commits semánticos:
- `feat:` — Nueva funcionalidad
- `fix:` — Corrección de bug
- `docs:` — Documentación
- `refactor:` — Refactorización
- `test:` — Tests
- `chore:` — Mantenimiento

### 6. Pull Request
- Describe claramente qué cambia tu PR
- Referencia el issue relacionado (ej: `Closes #12`)
- Asegúrate de que pase los checks

## 🐳 Entorno de Desarrollo

### Requisitos
- Docker & Docker Compose v2
- Node.js 20+ (para desarrollo local)
- Git

### Desarrollo local
```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

## 🐛 Reportar Bugs

Si encuentras un bug, por favor abre un [issue](https://github.com/SebaWag/onboarding-hub/issues/new) con:
- Descripción clara del problema
- Pasos para reproducirlo
- Versión del proyecto
- Logs o screenshots si aplica

## 💡 ¿Dudas?

Abre un issue con la etiqueta `question` y te responderemos lo antes posible.

---

**¡Gracias por ser parte de este proyecto!** 🚀
