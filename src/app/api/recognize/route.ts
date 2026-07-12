/* eslint-disable @typescript-eslint/no-explicit-any */
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

    const imageUrl = await uploadImage(file);

    let recognition;
    try {
      recognition = await recognizeDish(base64, file.type);
    } catch (e: any) {
      console.warn("Recognition failed, returning upload only:", e?.message);
      recognition = null;
    }

    if (recognition) {
	      return NextResponse.json({ ...recognition, imageUrl });
	    }
	    return NextResponse.json({ imageUrl, aiFailed: true }, { status: 422 });
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("Recognition error:", msg);
    return NextResponse.json({
      error: msg.includes("API key") ? "Gemini API Key 无效，请检查环境变量 GEMINI_API_KEY。手动输入菜品信息即可保存。"
        : msg.includes("fetch") ? "网络连接失败，请检查是否可访问 Google API。可手动输入菜品信息。"
        : `识别失败：${msg}。可手动输入菜品信息。`,
      manualFallback: true,
    }, { status: 500 });
  }
}
