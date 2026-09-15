import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ASSET_RECOVERY_SCRIPT } from "./asset-recovery";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  // Teinte la barre systeme de l'application installee, pour qu'elle
  // prolonge la barre laterale au lieu de trancher avec.
  themeColor: "#0B1120",
};

export const metadata: Metadata = {
  title: "Lead2Door",
  description: "Digital Order Profit System",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Avant tout le reste : c'est ce script qui rattrape une page dont
          les fichiers de build ont disparu apres un deploiement.
        */}
        <script dangerouslySetInnerHTML={{ __html: ASSET_RECOVERY_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
