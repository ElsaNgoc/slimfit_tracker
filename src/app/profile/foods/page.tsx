import { Suspense } from "react";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getCustomFoods } from "@/db/queries/custom-foods";
import { CustomFoodManager } from "@/components/profile/CustomFoodManager";
import { SubPageHeader } from "@/components/profile/ProfileMenu";

export const metadata: Metadata = {
  title: "Từ điển món ăn của tôi — Slimfit Tracker",
};

export default function CustomFoodsPage() {
  return (
    <div className="flex flex-col gap-4 pb-8">
      <SubPageHeader title="Từ điển món ăn của tôi" description="Các món bạn đã lưu khi tự nhập bữa ăn." />
      <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-card" aria-hidden />}>
        <FoodsContent />
      </Suspense>
    </div>
  );
}

/** Đọc auth + DB ở request time → phải nằm trong Suspense (Cache Components). */
async function FoodsContent() {
  const { userId } = await auth(); // route đã được proxy.ts bảo vệ
  const foods = userId ? await getCustomFoods(userId) : [];
  return <CustomFoodManager initialFoods={foods} />;
}
