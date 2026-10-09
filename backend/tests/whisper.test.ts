import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { whisperService } from '../src/services/whisper';

function makeTempAudio(): string {
  const p = path.join(
    os.tmpdir(),
    `whisper-test-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`
  );
  fs.writeFileSync(p, Buffer.from('RIFF....WAVEfmt '));
  return p;
}

describe('WhisperService.transcribe (llamada HTTP nativa, sin subprocesos)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTempAudio();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (tmp && fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });

  it('envía multipart a /inference con fetch y mapea la respuesta', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        text: 'hola mundo',
        language: 'es',
        duration: 2.5,
        segments: [
          { start: 0, end: 1.2, text: ' hola' },
          { start: 1.2, end: 2.5, text: ' mundo ' },
        ],
      }),
    }) as any);
    vi.stubGlobal('fetch', mockFetch);

    const result = await whisperService.transcribe(tmp);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/inference');
    expect(init.method).toBe('POST');
    // Se manda FormData (multipart) — NO se lanza ningún proceso `curl`.
    expect(init.body).toBeInstanceOf(FormData);
    expect(result.text).toBe('hola mundo');
    expect(result.language).toBe('es');
    expect(result.segments).toHaveLength(2);
    expect(result.segments[1].text).toBe('mundo');
  });

  it('lanza error con el status cuando el servidor responde no-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'boom',
      }) as any)
    );

    await expect(whisperService.transcribe(tmp)).rejects.toThrow(/500/);
  });

  it('reporta timeout cuando fetch aborta', async () => {
    const abortErr: any = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn(async () => { throw abortErr; }));

    await expect(whisperService.transcribe(tmp)).rejects.toThrow(/timed out/);
  });

  it('lanza si el archivo no existe', async () => {
    await expect(whisperService.transcribe('/no/existe.wav')).rejects.toThrow(/File not found/);
  });
});

describe('WhisperService — utilidades de subtítulos', () => {
  it('genera un SRT bien formado', () => {
    const srt = whisperService.generateSRT([
      { start: 0, end: 1.5, text: 'Hola' },
      { start: 1.5, end: 3, text: 'Mundo' },
    ]);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:01,500\nHola');
    expect(srt).toContain('2\n00:00:01,500 --> 00:00:03,000\nMundo');
  });

  it('devuelve [] si no hay segmentos', () => {
    expect(whisperService.generateChapters([])).toEqual([]);
  });
});
