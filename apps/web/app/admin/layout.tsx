import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center gap-6">
          <span className="font-semibold text-sm">Admin</span>
          <Link
            href="/admin"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/admin/venues"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Venues
          </Link>
          <Link
            href="/admin/instances"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Instances
          </Link>
          <Link
            href="/admin/sessions"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sessions
          </Link>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
