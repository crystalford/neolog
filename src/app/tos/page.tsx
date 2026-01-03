import Link from 'next/link'
import { Header } from '@/components/Header'

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 pt-20">
          <div className="mb-10">
            <p className="text-sm uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
              Legal
            </p>
            <h1 className="font-display text-4xl mb-3">Terms of Service</h1>
            <p className="text-[var(--text-secondary)]">
              These Terms govern your use of Neolog. By using the platform, you agree to them. For
              questions, contact{' '}
              <Link href="mailto:legal@neolog.ai" className="text-[var(--accent)] hover:underline">
                legal@neolog.ai
              </Link>
              .
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-3">
              Last updated: March 8, 2025
            </p>
          </div>

          <div className="space-y-10 text-[var(--text-secondary)]">
            <section className="space-y-3">
              <h2 className="font-display text-2xl text-[var(--text-primary)]">Acceptance of terms</h2>
              <p>
                By accessing or using Neolog, you agree to these Terms and our Privacy Policy. If you do
                not agree, do not use the service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-2xl text-[var(--text-primary)]">Accounts</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>You are responsible for keeping your credentials secure.</li>
                <li>You must provide accurate information and keep it up to date.</li>
                <li>You are responsible for all activity that occurs under your account.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-2xl text-[var(--text-primary)]">Content and ownership</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>You retain ownership of content you publish on Neolog.</li>
                <li>You grant Neolog a license to host, display, and distribute your content.</li>
                <li>You are responsible for ensuring your content does not violate laws or rights.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-2xl text-[var(--text-primary)]">Paid features</h2>
              <p>
                Paid features may be subject to additional terms, billing, and payout requirements.
                You are responsible for any applicable taxes.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-2xl text-[var(--text-primary)]">Prohibited use</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>Do not misuse the platform or attempt to access systems without authorization.</li>
                <li>Do not upload malicious code, spam, or content that violates others' rights.</li>
                <li>Do not interfere with the integrity or performance of the service.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-2xl text-[var(--text-primary)]">Termination</h2>
              <p>
                We may suspend or terminate access if you violate these Terms or if needed to protect
                the platform. You may stop using the service at any time.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-2xl text-[var(--text-primary)]">Disclaimer</h2>
              <p>
                Neolog is provided on an "as is" and "as available" basis without warranties of any kind.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-2xl text-[var(--text-primary)]">Limitation of liability</h2>
              <p>
                To the maximum extent permitted by law, Neolog is not liable for indirect or consequential
                damages arising from your use of the service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-2xl text-[var(--text-primary)]">Contact</h2>
              <p>
                For questions about these Terms, email{' '}
                <Link href="mailto:legal@neolog.ai" className="text-[var(--accent)] hover:underline">
                  legal@neolog.ai
                </Link>
                .
              </p>
            </section>
          </div>
        </div>
      </main>
    </>
  )
}
