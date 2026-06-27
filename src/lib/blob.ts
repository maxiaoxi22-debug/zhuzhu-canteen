import { put } from "@vercel/blob";

export async function uploadImage(file: File): Promise<string> {
  const { url } = await put(`zhuzhu-canteen/${Date.now()}-${file.name}`, file, {
    access: "public",
  });
  return url;
}