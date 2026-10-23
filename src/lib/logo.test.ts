import { describe, expect, it } from "vitest";
import { LOGO_KEY, LOGO_MAX_CHARS, isImageDataUrl, loadLogo, saveLogo } from "./logo";

function memStore(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
  } as Storage;
}

const png = "data:image/png;base64,iVBORw0KGgo=";

describe("logo setting", () => {
  it("returns null when nothing is saved", () => {
    expect(loadLogo(memStore())).toBeNull();
  });
  it("saves and loads a valid image data URL", () => {
    const s = memStore();
    expect(saveLogo(png, s)).toBe(true);
    expect(s.getItem(LOGO_KEY)).toBe(png);
    expect(loadLogo(s)).toBe(png);
  });
  it("removes the logo when saved as null", () => {
    const s = memStore();
    saveLogo(png, s);
    expect(saveLogo(null, s)).toBe(true);
    expect(loadLogo(s)).toBeNull();
  });
  it("rejects non-image and script payloads", () => {
    const s = memStore();
    expect(saveLogo("javascript:alert(1)", s)).toBe(false);
    expect(saveLogo("data:text/html;base64,PGI+", s)).toBe(false);
    expect(s.getItem(LOGO_KEY)).toBeNull();
  });
  it("rejects oversized logos", () => {
    const big = "data:image/png;base64," + "A".repeat(LOGO_MAX_CHARS);
    expect(saveLogo(big, memStore())).toBe(false);
  });
  it("ignores a corrupt stored value on load", () => {
    const s = memStore();
    s.setItem(LOGO_KEY, "<script>x</script>");
    expect(loadLogo(s)).toBeNull();
    expect(isImageDataUrl(png)).toBe(true);
  });
});
