export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-5xl tracking-tight text-secondary">
          The Casting Room
        </h1>
        <p className="text-lg text-muted-foreground max-w-[600px]">
          Create deeply developed AI character personas using method acting
          frameworks from Stanislavski, Strasberg, Adler, Meisner, Hagen, and
          Chubbuck.
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Sign In
          </a>
          <a
            href="/register"
            className="inline-flex items-center justify-center rounded-md border border-border px-6 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Create Account
          </a>
        </div>
      </div>
    </main>
  );
}
