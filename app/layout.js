import "./globals.css";

export const metadata = {
  title: "Football Predictor",
  description: "Daily football match predictions, form and value vs bookmaker odds.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
