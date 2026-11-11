import { Suspense } from "react";
import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-black/80">
      <nav className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <div className="flex items-center gap-1">
          <Link href="/" className="pr-2 text-lg font-semibold tracking-tight">
            Slimfit
          </Link>
          <Link
            href="/workouts"
            className="flex h-11 items-center rounded-full px-3 text-sm font-medium text-zinc-300 hover:bg-white/10"
          >
            Tập luyện
          </Link>
        </div>

        {/* Auth state đọc từ request → phải nằm trong Suspense (Cache Components của Next 16) */}
        <Suspense fallback={<div className="size-11 rounded-full bg-black/5 dark:bg-white/10" />}>
          <AuthControls />
        </Suspense>
      </nav>
    </header>
  );
}

function AuthControls() {
  return (
    <div className="flex items-center gap-2">
      <Show when="signed-out">
        <SignInButton>
          <button className="h-11 rounded-full px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10">
            Đăng nhập
          </button>
        </SignInButton>
        <SignUpButton>
          <button className="h-11 rounded-full bg-black px-4 text-sm font-medium text-white dark:bg-white dark:text-black">
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
