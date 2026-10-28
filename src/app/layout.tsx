import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "럭키팡: 문장던전 - 문장 성분과 호응 관계",
  description: "초등 국어 문장 성분과 호응 관계를 배우는 덱빌딩 카드 배틀 어드벤처 - 주어, 서술어, 목적어, 시간·높임 호응, 부정·인과 호응",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
