import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

async function seed() {
  const { db } = await import("./index");
  const { categories } = await import("./schema");

  console.log("Seeding categories...");
  const existing = await db.select().from(categories);
  if (existing.length > 0) {
    console.log(`Categories already seeded (${existing.length} rows), skipping.`);
    return;
  }
  const names = ["肉类", "青菜", "主食", "海鲜", "汤类", "其他"];
  for (let i = 0; i < names.length; i++) {
    await db.insert(categories).values({
      name: names[i],
      sortOrder: i + 1,
    });
  }
  console.log("Seeded", names.length, "categories.");
}

seed().catch(console.error);
