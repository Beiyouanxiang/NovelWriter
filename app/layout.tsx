import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/AuthProvider";
import SWRegister from "@/components/pwa/SWRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "小说创作工作台",
  description: "本地优先、支持协作的中文小说创作工作台",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <AuthProvider>
          {children}
          <SWRegister />
        </AuthProvider>
      </body>
    </html>
  );
}
