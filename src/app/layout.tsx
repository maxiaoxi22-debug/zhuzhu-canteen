import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "猪猪食堂",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "猪猪食堂" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-gray-100 flex justify-center min-h-screen">
        <div className="w-full max-w-[430px] bg-white min-h-screen relative shadow-lg">
          {children}
        </div>
      </body>
    </html>
  );
}