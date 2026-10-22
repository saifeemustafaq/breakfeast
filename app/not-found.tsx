import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-5 pt-24 text-center">
      <h1 className="font-heading text-3xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">That page doesn&apos;t exist or has moved.</p>
      <Link href="/" className="font-medium underline underline-offset-4">
        Back to Breakfeast
      </Link>
    </main>
  );
}
