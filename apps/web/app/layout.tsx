// This layout is only used for API routes and static files
// All page routes are handled by app/[locale]/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
