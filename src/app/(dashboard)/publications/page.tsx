'use client'

import { PublicationsManager } from '@/components/PublicationsManager'
import { Header } from '@/components/Header'

export default function PublicationsPage() {
  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <PublicationsManager />
      </main>
    </>
  )
}
