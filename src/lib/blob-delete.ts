import { del } from "@vercel/blob";

export function isManagedDishBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname.endsWith(".public.blob.vercel-storage.com")
      && url.pathname.startsWith("/zhuzhu-canteen/");
  } catch {
    return false;
  }
}

export async function deleteManagedDishBlob(value: string | null): Promise<void> {
  if (value && isManagedDishBlobUrl(value)) await del(value);
}
