import { NextRequest, NextResponse } from "next/server";
import { recognizeDish } from "@/lib/gemini";
import { uploadImage } from "@/lib/blob";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File;
    if (!file) return NextResponse.json({ error: "No image provided" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const [recognition, imageUrl] = await Promise.all([
      recognizeDish(base64, file.type),
      uploadImage(file),
    ]);

    return NextResponse.json({ ...recognition, imageUrl });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Recognition failed" }, { status: 500 });
  }
}