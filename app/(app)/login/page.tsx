import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Breakfeast" };

export default function LoginPage() {
  return (
    <section className="flex flex-1 flex-col justify-center gap-8">
      <div className="text-center">
        <h1 className="font-heading text-4xl font-semibold">Breakfeast</h1>
        <p className="mt-2 text-muted-foreground">What&apos;s for breakfast, and what to buy for it.</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </section>
  );
}
