import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-4">
      <h1 className="text-2xl font-semibold mb-2">404</h1>
      <p className="text-muted-foreground mb-6">This page could not be found.</p>
      <Link
        href="/"
        className="text-primary hover:underline"
      >
        Return home
      </Link>
    </div>
  );
}
