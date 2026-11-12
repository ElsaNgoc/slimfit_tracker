"use client";

import { useState } from "react";
import { ProfileForm, type ProfileValues } from "./ProfileForm";

/** Hồ sơ chưa đủ → mở form sẵn; đã đủ → thu gọn thành nút "Sửa hồ sơ". */
export function ProfileCard({ initial, complete }: { initial: ProfileValues; complete: boolean }) {
  const [open, setOpen] = useState(!complete);

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">Hồ sơ cơ thể</h2>
          {!complete && (
            <p className="text-sm text-zinc-500">Nhập thông tin để tính BMR / TDEE.</p>
          )}
        </div>
        {complete && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="h-11 rounded-full px-4 text-sm font-medium text-emerald-400 active:bg-zinc-800"
          >
            {open ? "Đóng" : "Sửa hồ sơ"}
          </button>
        )}
      </div>
      {open && <ProfileForm initial={initial} onSaved={() => setOpen(false)} />}
    </section>
  );
}
