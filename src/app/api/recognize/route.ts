import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createConfiguredVisionProviders,
  recognizeWithProviders,
  VisionRecognitionError,
  type VisionRecognitionResult,
} from "../../../lib/vision";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type Recognize = (input: {
  bytes: Uint8Array;
  mimeType: string;
  requestId: string;
}) => Promise<VisionRecognitionResult>;

const recognize: Recognize = (input) => recognizeWithProviders(
  input,
  { ...createConfiguredVisionProviders(), timeoutMs: 20_000 },
);

export function createRecognizeHandler(
  recognizeImage: Recognize = recognize,
  createRequestId: () => string = randomUUID,
) {
  return async function recognizeHandler(request: Request) {
    const requestId = createRequestId();
    const startedAt = Date.now();
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "请上传菜品照片", requestId }, { status: 400 });
    }

    const image = formData.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "请上传菜品照片", requestId }, { status: 400 });
    }
    if (!image.type.startsWith("image/")) {
      return NextResponse.json({ error: "仅支持图片文件", requestId }, { status: 415 });
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "图片不能超过 10 MB", requestId }, { status: 413 });
    }

    try {
      const result = await recognizeImage({
        bytes: new Uint8Array(await image.arrayBuffer()),
        mimeType: image.type,
        requestId,
      });
      console.info("Dish recognition completed", {
        requestId,
        provider: result.provider,
        elapsedMs: Date.now() - startedAt,
      });
      return NextResponse.json(result);
    } catch (error) {
      const errorType = error instanceof VisionRecognitionError ? error.code : "unavailable";
      console.warn("Dish recognition failed", {
        requestId,
        errorType,
        elapsedMs: Date.now() - startedAt,
      });
      return NextResponse.json({
        error: "AI 暂时无法识别，请手动输入菜品信息",
        manualFallback: true,
        requestId,
      }, { status: 422 });
    }
  };
}

export const POST = createRecognizeHandler();
