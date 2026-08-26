/**
 * Cliente HTTP central del frontend.
 *
 * - Base URL configurable via VITE_API_URL (default `/api`, resuelta por el
 *   proxy de Vite en desarrollo y por nginx en produccion).
 * - Inyecta `Authorization: Bearer` desde localStorage (`auth_token`).
 * - Timeout por request via AbortController (desactivable para uploads).
 * - Errores tipados: `ApiError` con status y cuerpo parseado.
 * - En 401 con sesion activa limpia el token y redirige a /login
 *   (excepto en /share, que es publica).
 */

export class ApiError extends Error {
  readonly status: number
  readonly data: unknown

  constructor(status: number, message: string, data: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const DEFAULT_TIMEOUT_MS = 30_000

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Objeto plano -> JSON. FormData pasa tal cual (sin Content-Type manual). */
  body?: unknown
  /** Milisegundos; 0 desactiva el timeout (uploads grandes). Default 30s. */
  timeoutMs?: number
  headers?: Record<string, string>
}

function buildHeaders(body: unknown, extra: Record<string, string>): HeadersInit {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const token = localStorage.getItem('auth_token')
  return {
    ...(body !== undefined && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function apiRequest<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, headers = {} } = opts

  const controller = new AbortController()
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: buildHeaders(body, headers),
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? (body as FormData)
            : JSON.stringify(body),
      signal: controller.signal,
    })

    // Sesion expirada: limpiar y llevar a login (fuera de rutas publicas).
    if (res.status === 401 && localStorage.getItem('auth_token') && !window.location.pathname.startsWith('/share')) {
      localStorage.removeItem('auth_token')
      window.location.assign('/login')
    }

    if (!res.ok) {
      const data = await parseJsonSafe(res)
      const backendMsg =
        data && typeof data === 'object' && 'error' in data
          ? String((data as { error: unknown }).error)
          : null
      throw new ApiError(res.status, backendMsg ?? `HTTP ${res.status}`, data)
    }

    return (await res.json()) as T
  } catch (e) {
    if (e instanceof ApiError) throw e
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError(408, 'La peticion excedio el tiempo limite', null)
    }
    throw e
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Resultado de una descarga binaria autenticada. */
export interface DownloadResult {
  blob: Blob
  contentType: string
  /** Filename del header Content-Disposition, si viene. */
  filename?: string
}

/** Extrae el filename del header Content-Disposition, si presente. */
function filenameFromDisposition(disposition: string | null): string | undefined {
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  return match ? decodeURIComponent(match[1]) : undefined
}

/** Descarga binaria autenticada (usa auth header, no query params). */
export async function apiDownload(path: string, opts: RequestOptions = {}): Promise<DownloadResult> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {} } = opts
  const controller = new AbortController()
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: buildHeaders(undefined, headers),
      signal: controller.signal,
    })
    if (!res.ok) {
      const data = await parseJsonSafe(res)
      throw new ApiError(res.status, `HTTP ${res.status}`, data)
    }
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
    return {
      blob: await res.blob(),
      contentType,
      filename: filenameFromDisposition(res.headers.get('content-disposition')),
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const api = {
  get: <T = unknown>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'GET' }),
  post: <T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'POST', body }),
  put: <T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'PUT', body }),
  patch: <T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'PATCH', body }),
  del: <T = unknown>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'DELETE' }),
  /** Subida multipart. Sin timeout por defecto (archivos grandes). */
  upload: <T = unknown>(path: string, formData: FormData, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'POST', body: formData, timeoutMs: opts?.timeoutMs ?? 0 }),
  download: apiDownload,
}
