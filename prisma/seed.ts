import "dotenv/config";
import { PrismaClient, TxType } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const categories = [
  { name: "Клиенты", type: TxType.INCOME, slug: "clients", color: "#10b981", sortOrder: 0 },
  { name: "Партнёрские программы", type: TxType.INCOME, slug: "affiliates", color: "#34d399", sortOrder: 1 },
  { name: "Рекламный доход", type: TxType.INCOME, slug: "ad-revenue", color: "#6ee7b7", sortOrder: 2 },
  { name: "Фриланс", type: TxType.INCOME, slug: "freelance", color: "#a7f3d0", sortOrder: 3 },
  { name: "Возвраты", type: TxType.INCOME, slug: "refunds", color: "#d1fae5", sortOrder: 4 },
  { name: "Прочий доход", type: TxType.INCOME, slug: "other-income", color: "#ecfdf5", sortOrder: 5 },
  { name: "Google Ads", type: TxType.EXPENSE, slug: "google-ads", color: "#f43f5e", sortOrder: 0 },
  { name: "Bing Ads", type: TxType.EXPENSE, slug: "bing-ads", color: "#e11d48", sortOrder: 1 },
  { name: "Facebook/Meta Ads", type: TxType.EXPENSE, slug: "meta-ads", color: "#be123c", sortOrder: 2 },
  { name: "TikTok Ads", type: TxType.EXPENSE, slug: "tiktok-ads", color: "#9f1239", sortOrder: 3 },
  { name: "Комиссия агентств", type: TxType.EXPENSE, slug: "agency-fees", color: "#fb923c", sortOrder: 4 },
  { name: "Подписки/Сервисы", type: TxType.EXPENSE, slug: "subscriptions", color: "#f97316", sortOrder: 5 },
  { name: "Софт/Инструменты", type: TxType.EXPENSE, slug: "software", color: "#ea580c", sortOrder: 6 },
  { name: "Фриланс-биржи", type: TxType.EXPENSE, slug: "freelance-platforms", color: "#c2410c", sortOrder: 7 },
  { name: "Аккаунты", type: TxType.EXPENSE, slug: "accounts", color: "#a855f7", sortOrder: 8 },
  { name: "Домены/Хостинг", type: TxType.EXPENSE, slug: "domains-hosting", color: "#8b5cf6", sortOrder: 9 },
  { name: "VPN/Прокси", type: TxType.EXPENSE, slug: "vpn-proxy", color: "#7c3aed", sortOrder: 10 },
  { name: "Связь/Интернет", type: TxType.EXPENSE, slug: "telecom", color: "#6d28d9", sortOrder: 11 },
  { name: "Обучение", type: TxType.EXPENSE, slug: "education", color: "#5b21b6", sortOrder: 12 },
  { name: "Прочий расход", type: TxType.EXPENSE, slug: "other-expense", color: "#4c1d95", sortOrder: 13 },
];

async function main() {
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { type_slug: { type: cat.type, slug: cat.slug } },
      update: { name: cat.name, color: cat.color, sortOrder: cat.sortOrder },
      create: cat,
    });
  }
  console.log(`Seeded ${categories.length} categories`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
