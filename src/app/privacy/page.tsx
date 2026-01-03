import Link from 'next/link'
import { Header } from '@/components/Header'

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="pt-20 pb-16">
        <div className="max-w-3xl mx-auto px-6 pt-20">
          <div className="mb-10">
            <p className="text-sm uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
              Legal
            </p>
            <h1 className="font-display text-4xl mb-3">Privacy Policy</h1>
            <p className="text-[var(--text-secondary)]">
              This Privacy Policy explains how Neolog collects, uses, and protects your information.
              If you have questions, reach us at{' '}
              <Link href="mailto:privacy@neolog.ai" className="text-[var(--accent)] hover:underline">
                privacy@neolog.ai
              </Link>
              .
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-3">
              Last updated: March 8, 2025
            </p>
          </div>

          <div className="space-y-10 text-[var(--text-secondary)]">
            <section className="space-y-3">
              <h2 className="font-display text-2xl text-[var(--text-primary)]">Information we collect</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>Account data such as name, username, email address, and authentication details.</li>
                <li>Content you publish, including posts, drafts, and profile information.</li>
                <li>Usage data such as pages visited, interactions, device details, and IP address.</li>
                <li>Payment and payout data if you enable monetization features.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-2xl text-[var(--text-primary)]">How we use information</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>Provide, maintain, and improve the Neolog platform.</li>
                <li>Authenticate users and secure accounts.</li>
                <li>Send service updates, transactional messages, and optional marketing emails.</li>
                <li>Measure engagement and understand how features are used.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-2xl text-[var(--text-primary)]">Sharing and disclosure</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>We share data with service providers that help operate Neolog (hosting, analytics, email).</li>
                <li>We may disclose information to comply with law, enforce policies, or protect rights.</li>
                <li>We never sell personal information.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-2xl text-[var(--text-primary)]">Cookies and analytics</h2>
              <p>
                We use cookies and similar technologies to keep you signed in, remember preferences,
                and understand usage. You can control cookies through your browser settings, but some
                features may not work without them.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-2xl text-[var(--text-primary)]">Data retention</h2>
              <p>
                We retain information for as long as needed to provide the service, comply with legal
                obligations, and resolve disputes. You can request deletion of your account at any time.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-2xl text-[var(--text-primary)]">Your choices</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>Access, update, or delete your profile information in account settings.</li>
                <li>Unsubscribe from marketing emails using the links we provide.</li>
                <li>Request data access or deletion by contacting us.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-2xl text-[var(--text-primary)]">Contact</h2>
              <p>
                Questions about privacy? Email us at{' '}
                <Link href="mailto:privacy@neolog.ai" className="text-[var(--accent)] hover:underline">
                  privacy@neolog.ai
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
