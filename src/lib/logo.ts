/** Storage key for the user's invoice logo (a data URL). */
export const LOGO_KEY = "mercureal-invoice:logo";
/** Largest logo we keep, in bytes of data URL text. Keeps localStorage healthy. */
export const LOGO_MAX_CHARS = 400_000;

export function loadLogo(storage: Storage = localStorage): string | null {
  try {
    const v = storage.getItem(LOGO_KEY);
    return v && isImageDataUrl(v) ? v : null;
  } catch {
    return null;
  }
}

export function isImageDataUrl(s: string): boolean {
  return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s);
}

/** Save a logo data URL, or remove it when value is null. Returns false when it is rejected or does not fit. */
export function saveLogo(value: string | null, storage: Storage = localStorage): boolean {
  try {
    if (value === null) {
      storage.removeItem(LOGO_KEY);
      return true;
    }
    if (!isImageDataUrl(value) || value.length > LOGO_MAX_CHARS) return false;
    storage.setItem(LOGO_KEY, value);
    return true;
  } catch {
    return false;
  }
}

/** Downscale an image file to a PNG data URL no wider than maxWidth. Browser-only. */
export async function resizeImageFile(file: File, maxWidth = 512): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that image."));
      el.src = url;
    });
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the image.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
