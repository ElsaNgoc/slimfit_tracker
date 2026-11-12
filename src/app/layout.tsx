import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { BottomNav, Navbar } from "@/components/navbar";
import { DEFAULT_THEME, THEME_INIT_SCRIPT, THEMES } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Slimfit Tracker",
  description: "Theo dõi tập luyện và dinh dưỡng",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Màu thanh trạng thái theo theme mặc định; script trong <head> đổi theo theme đã lưu
  themeColor: THEMES.find((t) => t.id === DEFAULT_THEME)!.swatch.background,
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      data-theme={DEFAULT_THEME}
      // Script dưới đổi data-theme theo localStorage trước khi React hydrate → bỏ cảnh báo lệch thuộc tính của riêng thẻ này
      suppressHydrationWarning
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Áp theme đã lưu TRƯỚC khi vẽ trang → không nháy màu theme mặc định */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <Navbar />
          {/* pb: chừa chỗ cho thanh tab đáy màn hình trên mobile (--bottom-nav-h = 0 từ md) */}
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-[calc(var(--bottom-nav-h)+1rem)]">
            {children}
          </main>
          <BottomNav />
        </ClerkProvider>
      </body>
    </html>
  );
}
