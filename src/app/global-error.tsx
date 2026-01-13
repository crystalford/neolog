'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body style={{ 
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: '#faf8f5',
        color: '#1a1816',
        margin: 0,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '16px',
            backgroundColor: 'rgba(220, 38, 38, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          
          <h1 style={{ 
            fontSize: '32px', 
            fontWeight: '600', 
            marginBottom: '12px',
            fontFamily: '"Source Serif 4", Georgia, serif',
          }}>
            Critical Error
          </h1>
          <p style={{ 
            color: '#6b6965', 
            marginBottom: '32px',
            lineHeight: '1.6',
          }}>
            Something went seriously wrong. Please refresh the page or try again later.
          </p>

          <button
            onClick={reset}
            style={{
              backgroundColor: '#c45d3a',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Try Again
          </button>

          {error.digest && (
            <p style={{ 
              marginTop: '32px', 
              fontSize: '12px', 
              color: '#a39e99',
            }}>
              Error ID: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
