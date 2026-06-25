import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — SignalSignin" },
      { name: "description", content: "How SignalSignin collects, uses, and protects your personal data." },
      { property: "og:title", content: "Privacy Policy — SignalSignin" },
      { property: "og:description", content: "How SignalSignin collects, uses, and protects your personal data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Back</Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: June 25, 2026</p>

        <section className="prose prose-invert mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <p>
            This Privacy Policy explains how SignalSignin ("we", "us") collects, uses, and shares
            information about you when you use our Service.
          </p>

          <h2 className="text-base font-semibold text-foreground">1. Information we collect</h2>
          <p>
            We collect account information you provide (email, name), authentication metadata,
            usage telemetry, and information about devices you use to access the Service.
          </p>

          <h2 className="text-base font-semibold text-foreground">2. How we use information</h2>
          <p>
            We use the data to operate, secure, and improve the Service, to communicate with you,
            and to comply with legal obligations.
          </p>

          <h2 className="text-base font-semibold text-foreground">3. Sharing</h2>
          <p>
            We do not sell personal information. We share data only with processors needed to run
            the Service (hosting, analytics, payments) under contracts that require confidentiality.
          </p>

          <h2 className="text-base font-semibold text-foreground">4. Your rights</h2>
          <p>
            Depending on your jurisdiction you may have rights to access, correct, or delete your
            personal data. Contact us to exercise these rights.
          </p>

          <h2 className="text-base font-semibold text-foreground">5. Contact</h2>
          <p>For privacy questions, contact support@signalsignin.company.</p>

          <p className="pt-4 italic">
            This is placeholder content. Replace with your final legal text before launch.
          </p>
        </section>
      </div>
    </main>
  );
}
