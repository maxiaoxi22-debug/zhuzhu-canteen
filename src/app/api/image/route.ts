import { NextRequest, NextResponse } from "next/server";

function allowedBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("url") || "";
  if (!allowedBlobUrl(source)) {
    return NextResponse.json({ error: "不允许的图片地址" }, { status: 400 });
  }

  try {
    const upstream = await fetch(source, { cache: "force-cache" });
    const contentType = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !contentType.startsWith("image/")) {
      return NextResponse.json({ error: "图片读取失败" }, { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return NextResponse.json({ error: "图片网络连接失败" }, { status: 502 });
  }
}
