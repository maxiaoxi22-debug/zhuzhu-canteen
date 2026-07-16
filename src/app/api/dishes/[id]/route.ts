import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { dishes, mealPlans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findDishDuplicate } from "@/lib/dish-duplicate-server";
import { normalizeDishName } from "@/lib/dish-name-match";
import { deleteManagedDishBlob, isManagedDishBlobUrl } from "@/lib/blob-delete";
import { verifyUploadCleanupToken } from "@/lib/upload-cleanup-token";
import { claimPhotoUpload } from "@/lib/photo-upload-reservation";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await db.select().from(dishes).where(eq(dishes.id, id)).limit(1);
  if (!result.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result[0]);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "菜品名称不能为空" }, { status: 400 });
  }
  const existing = await db.select({ id: dishes.id, imageUrl: dishes.imageUrl }).from(dishes).where(eq(dishes.id, id)).limit(1);
  if (!existing.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const match = await findDishDuplicate(body.name.trim(), id);
  if (match) return NextResponse.json({ error: match.message, match }, { status: 409 });
  const now = new Date().toISOString();
  const nextImageUrl = typeof body.imageUrl === "string" && body.imageUrl ? body.imageUrl : null;
  const imageChanged = nextImageUrl !== existing[0].imageUrl;
  const photoUploadId = typeof body.photoUploadId === "string" && body.photoUploadId.trim()
    ? body.photoUploadId.trim()
    : null;
  if (imageChanged && (photoUploadId || isManagedDishBlobUrl(nextImageUrl ?? ""))) {
    const token = typeof body.photoUploadToken === "string" ? body.photoUploadToken : "";
    const payload = verifyUploadCleanupToken(token, process.env.BLOB_READ_WRITE_TOKEN ?? "");
    if (!nextImageUrl || !payload
      || payload.reservationId !== photoUploadId
      || payload.imageUrl !== nextImageUrl) {
      return NextResponse.json({ error: "照片上传凭证无效，请重新选择照片" }, { status: 400 });
    }
  }

  try {
    await db.transaction(async (transaction) => {
      if (imageChanged && photoUploadId && nextImageUrl && !(await claimPhotoUpload(transaction, {
        id: photoUploadId,
        imageUrl: nextImageUrl,
        dishId: id,
        now: Date.now(),
      }))) throw new Error("photo-unavailable");
      await transaction
        .update(dishes)
        .set({
          name: body.name.trim(),
          nameKey: normalizeDishName(body.name),
          categoryId: typeof body.categoryId === "number" ? body.categoryId : null,
          imageUrl: nextImageUrl,
          ingredients: JSON.stringify(Array.isArray(body.ingredients) ? body.ingredients : []),
          steps: JSON.stringify(Array.isArray(body.steps) ? body.steps : []),
          updatedAt: now,
        })
        .where(eq(dishes.id, id));
    });
  } catch (error) {
    if (error instanceof Error && error.message === "photo-unavailable") {
      return NextResponse.json({ error: "照片已失效，请重新选择后保存" }, { status: 400 });
    }
    throw error;
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await db.select({ imageUrl: dishes.imageUrl }).from(dishes).where(eq(dishes.id, id)).limit(1);
  if (!existing.length) return NextResponse.json({ error: "菜品不存在" }, { status: 404 });

  await db.transaction(async (tx) => {
    await tx.delete(mealPlans).where(eq(mealPlans.dishId, id));
    await tx.delete(dishes).where(eq(dishes.id, id));
  });

  try {
    await deleteManagedDishBlob(existing[0].imageUrl);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("dish image cleanup failed", error);
    return NextResponse.json({ success: true, imageCleanupWarning: "图片清理稍后重试" });
  }
}
