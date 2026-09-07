import type { Metadata } from "next";
import { AppNavigation } from "@/components/app-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "KidLoop Operations",
  description: "After-school transportation and family ride management",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <AppNavigation />
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
