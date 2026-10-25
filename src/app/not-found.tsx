import { GeometricBackground } from "@/components/GeometricBackground";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main" className="relative isolate flex min-h-dvh items-center justify-center px-4">
      <GeometricBackground className="-z-10" variant="rings" />
      <div className="max-w-sm text-center">
        <p className="text-meta font-semibold uppercase tracking-wide text-fg-secondary">404</p>
        <h1 className="mt-2 text-page font-semibold">This page left the stage</h1>
        <p className="mt-2 text-fg-secondary">The concert or page you&apos;re looking for doesn&apos;t exist or isn&apos;t available to you.</p>
        <ButtonLink href="/discover" className="mt-6">
          Back to Discover
        </ButtonLink>
      </div>
    </main>
  );
}
