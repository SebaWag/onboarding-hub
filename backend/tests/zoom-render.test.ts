import { describe, expect, it } from 'vitest';
import { buildZoomFilter, sanitizeRegionsForRender } from '../src/services/zoom-render';

describe('sanitizeRegionsForRender', () => {
  it('descarta regiones inválidas y ordena por tiempo', () => {
    const out = sanitizeRegionsForRender([
      { startMs: 5000, endMs: 7000, depth: 3, focus: { cx: 0.2, cy: 0.2 } },
      { startMs: 1000, endMs: 2000, depth: 2, focus: { cx: 0.8, cy: 0.8 } },
      { startMs: 9000, endMs: 5000, depth: 1, focus: { cx: 0.1, cy: 0.1 } }, // inválida
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].startMs).toBe(1000);
    expect(out[1].startMs).toBe(5000);
  });

  it('clampea depth y focus', () => {
    const out = sanitizeRegionsForRender([
      { startMs: 0, endMs: 1000, depth: 99, focus: { cx: 5, cy: -3 } },
    ]);
    expect(out[0].depth).toBe(6);
    expect(out[0].focus!.cx).toBe(1);
    expect(out[0].focus!.cy).toBe(0);
  });
});

describe('buildZoomFilter', () => {
  it('devuelve null sin regiones', () => {
    expect(buildZoomFilter([], 1920, 1080)).toBeNull();
  });

  it('construye un zoompan con z/x/y y el tamaño pedido', () => {
    const f = buildZoomFilter([{ startMs: 1000, endMs: 3000, depth: 3, focus: { cx: 0.5, cy: 0.5 } }], 1920, 1080);
    expect(f).toContain('zoompan=');
    expect(f).toContain('s=1920x1080');
    expect(f).toContain("z='");
    expect(f).toContain('in_time');
    expect(f).toContain('iw/zoom');
  });

  it('incluye el foco de cada región', () => {
    const f = buildZoomFilter([
      { startMs: 1000, endMs: 3000, depth: 2, focus: { cx: 0.25, cy: 0.75 } },
    ], 1280, 720);
    expect(f).toContain('0.25');
    expect(f).toContain('0.75');
  });
});
