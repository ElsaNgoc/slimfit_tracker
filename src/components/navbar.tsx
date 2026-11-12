import { Suspense } from "react";
import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { TabNav } from "@/components/navigation/TabNav";

/** Header trên cùng: logo + tab (desktop) + nút tài khoản. Trên mobile tab nằm ở `BottomNav`. */
export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-4">
        <Link href="/" className="pr-2 text-lg font-semibold tracking-tight">
          Slimfit
        </Link>

        {/* Auth state đọc từ request → phải nằm trong Suspense (Cache Components của Next 16) */}
        <Suspense fallback={<div className="size-11 rounded-full bg-white/10" />}>
          <Show when="signed-in">
            <TabNav variant="top" />
          </Show>
          <AuthControls />
        </Suspense>
      </div>
    </header>
  );
}

/** Thanh tab đáy màn hình cho mobile — chỉ hiện khi đã đăng nhập. */
export function BottomNav() {
  return (
    <Suspense fallback={null}>
      <Show when="signed-in">
        <TabNav variant="bottom" />
      </Show>
    </Suspense>
  );
}

function AuthControls() {
  return (
    <div className="flex items-center gap-2">
      <Show when="signed-out">
        <SignInButton>
          <button className="h-11 rounded-full px-4 text-sm font-medium hover:bg-white/10">
            Đăng nhập
          </button>
        </SignInButton>
        <SignUpButton>
          <button className="h-11 rounded-full bg-white px-4 text-sm font-medium text-black">
            Đăng ký
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </div>
  );
}
