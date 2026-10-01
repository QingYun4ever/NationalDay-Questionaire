import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '国庆主题作品征集',
  description: '全校师生国庆主题作品征集。用照片、短视频与文字，留下对祖国的心意。',
  themeColor: '#9f1728',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
