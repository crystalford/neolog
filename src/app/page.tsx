import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

async function getStats() {
  const supabase = createClient()

  const [postsCount, creatorsCount] = await Promise.all([
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
  ])

  return {
    posts: postsCount.count || 0,
    creators: creatorsCount.count || 0,
  }
}

export default async function Home() {
  const stats = await getStats()

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-black rounded-sm flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="font-serif text-xl tracking-tight text-gray-900">Neolog</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">
              Sign in
            </Link>
            <Link href="/signup" className="bg-black text-white px-4 py-2 text-sm font-medium hover:bg-gray-800">
              Sign up
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main>
        <section className="max-w-5xl mx-auto px-6 py-24">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h1 className="font-serif text-5xl lg:text-6xl leading-tight mb-6">
                Publish raw HTML.{' '}
                <span className="text-gray-400 italic">No friction.</span>
              </h1>

              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                A publishing platform that respects your code. Drop HTML, paste markdown, publish instantly.
              </p>

              <div className="flex gap-4">
                <Link href="/signup" className="bg-black text-white px-6 py-3 font-medium hover:bg-gray-800">
                  Start writing
                </Link>
                <Link href="/explore" className="border border-gray-300 px-6 py-3 font-medium hover:border-gray-400">
                  Explore
                </Link>
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="bg-gray-900 rounded-lg p-6">
                <div className="flex gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
                <pre className="text-sm text-gray-300 font-mono">
                  <code className="text-purple-400">&lt;article&gt;</code>{'\n'}
                  <code className="text-blue-400">  &lt;h1&gt;</code>{'\n'}
                  <code className="text-white">    Publish HTML</code>{'\n'}
                  <code className="text-blue-400">  &lt;/h1&gt;</code>{'\n'}
                  <code className="text-blue-400">  &lt;p&gt;</code>{'\n'}
                  <code className="text-white">    No friction.</code>{'\n'}
                  <code className="text-blue-400">  &lt;/p&gt;</code>{'\n'}
                  <code className="text-purple-400">&lt;/article&gt;</code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* Problem / Solution */}
        <section className="border-t border-gray-200 py-24">
          <div className="max-w-5xl mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-16">
              <div>
                <span className="text-xs uppercase tracking-wide text-gray-400 mb-4 block">THE PROBLEM</span>
                <h2 className="font-serif text-3xl lg:text-4xl mb-6">
                  You spent hours crafting an HTML document. Then Medium destroyed it.
                </h2>
                <p className="text-gray-600 leading-relaxed">
                  Stripped your CSS. Mangled your code blocks. Broke your embeds. Forced everything into their template. Your work, their format.
                </p>
              </div>

              <div>
                <span className="text-xs uppercase tracking-wide text-gray-900 mb-4 block">THE SOLUTION</span>
                <h2 className="font-serif text-3xl lg:text-4xl mb-6">
                  Neolog renders your HTML exactly as you wrote it. Full stop.
                </h2>
                <p className="text-gray-600 leading-relaxed">
                  Drag. Drop. Publish. Your CSS runs. Your scripts execute. Interactive demos work. It's your document, just on the web.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-200 py-12">
          <div className="max-w-5xl mx-auto px-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-black rounded-sm flex items-center justify-center">
                  <span className="text-white font-bold text-xs">N</span>
                </div>
                <span className="font-serif text-lg">Neolog</span>
              </div>

              <div className="flex gap-8 text-sm">
                <Link href="/tos" className="text-gray-600 hover:text-gray-900">Terms</Link>
                <Link href="/privacy" className="text-gray-600 hover:text-gray-900">Privacy</Link>
              </div>
            </div>

            <div className="mt-8 text-center text-xs text-gray-400">
              © 2025 Neolog. Made with care for the web.
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}
