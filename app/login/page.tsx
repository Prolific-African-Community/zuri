import { LoginForm } from "@/components/login-form";
import { ZuriMark } from "@/components/zuri-logo";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const raw = params.from;
  const from = Array.isArray(raw) ? raw[0] : raw;
  const configError = (Array.isArray(params.error) ? params.error[0] : params.error) === "config";

  return (
    <main className="flex min-h-svh items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-sm animate-rise">
        <ZuriMark size={32} priority />
        <h1 className="type-page-title mt-6">Sign in</h1>
        <p className="type-body mt-2 text-ink-3">
          Zuri is private. Enter the workspace password to continue.
        </p>

        <div className="mt-8">
          <LoginForm from={from} configError={configError} />
        </div>
      </div>
    </main>
  );
}
