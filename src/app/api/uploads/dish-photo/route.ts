import { NextResponse } from "next/server";
import { uploadImage } from "../../../../lib/blob";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type UploadImage = (file: File) => Promise<string>;

export function createDishPhotoUploadHandler(upload: UploadImage = uploadImage) {
  return async function dishPhotoUploadHandler(request: Request) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "请上传菜品照片" }, { status: 400 });
    }

    const image = formData.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "请上传菜品照片" }, { status: 400 });
    }
    if (!image.type.startsWith("image/")) {
      return NextResponse.json({ error: "仅支持图片文件" }, { status: 415 });
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "图片不能超过 10 MB" }, { status: 413 });
    }

    try {
      return NextResponse.json({ imageUrl: await upload(image) });
    } catch {
      console.error("Dish photo upload failed");
      return NextResponse.json({ error: "照片上传失败，请稍后重试" }, { status: 500 });
    }
  };
}

export const POST = createDishPhotoUploadHandler();
