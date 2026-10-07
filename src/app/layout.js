import "./globals.css";

export const metadata = {
  title: "Language Study: từ vựng và đọc hiểu",
  description: "Học từ vựng tiếng Anh, tiếng Hàn, luyện gõ và ôn tập ngắt quãng."
};

export default function RootLayout({ children }) {
  return <html lang="vi"><body>{children}</body></html>;
}
