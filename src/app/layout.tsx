import type { Metadata } from "next";
import { Inter, Noto_Emoji, Noto_Sans_KR, Outfit } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
});

const notoSansKr = Noto_Sans_KR({
  variable: "--font-korean",
  display: "swap",
  weight: "variable",
});

const notoEmoji = Noto_Emoji({
  variable: "--font-emoji",
  subsets: ["emoji"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "건축설계 크리틱 로그 시스템 | SCL",
  description: "2026학년도 건축설계 수업 학생 크리틱 로그 및 교수 평가 시스템",
  openGraph: {
    title: "건축설계 크리틱 로그 시스템 | SCL",
    description: "2026학년도 건축설계 수업 학생 크리틱 로그 및 교수 평가 시스템",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${inter.variable} ${outfit.variable} ${notoSansKr.variable} ${notoEmoji.variable}`}>
      <body style={{ margin: 0, padding: 0 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
