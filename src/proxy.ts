import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Route công khai — mọi route khác yêu cầu đăng nhập.
const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Bỏ qua Next.js internals và file tĩnh, trừ khi xuất hiện trong search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Luôn chạy cho API routes
    "/(api|trpc)(.*)",
  ],
};
