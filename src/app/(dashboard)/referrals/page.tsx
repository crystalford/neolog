'use client'

import { ReferralSystem } from '@/components/ReferralSystem'
import { Header } from '@/components/Header'

export default function ReferralsPage() {
  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <ReferralSystem />
      </main>
    </>
  )
}
