'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

interface HtmlIframeProps {
  html: string
  className?: string
}

export function HtmlIframe({ html, className = '' }: HtmlIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(600)

  const srcDoc = useMemo(() => {
    const resizeScript = `
      <script>
        (function() {
          function sendHeight() {
            var doc = document.documentElement;
            var body = document.body;
            var height = Math.max(
              body.scrollHeight,
              body.offsetHeight,
              doc.clientHeight,
              doc.scrollHeight,
              doc.offsetHeight
            );
            parent.postMessage({ type: 'neolog-iframe-height', height: height }, '*');
          }
          if (document.readyState === 'complete') {
            sendHeight();
          } else {
            window.addEventListener('load', sendHeight);
          }
          window.addEventListener('resize', sendHeight);
          if (window.ResizeObserver) {
            var observer = new ResizeObserver(sendHeight);
            observer.observe(document.documentElement);
            observer.observe(document.body);
          }
          setTimeout(sendHeight, 50);
          setTimeout(sendHeight, 250);
          setTimeout(sendHeight, 1000);
        })();
      </script>
    `

    if (html.includes('</body>')) {
      return html.replace('</body>', `${resizeScript}</body>`)
    }
    return `${html}\n${resizeScript}`
  }, [html])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return
      if (!event.data || event.data.type !== 'neolog-iframe-height') return
      if (typeof event.data.height === 'number') {
        setHeight(Math.max(300, event.data.height))
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [srcDoc])

  return (
    <iframe
      ref={iframeRef}
      title="Imported HTML"
      className={`w-full border-0 ${className}`}
      style={{ height }}
      sandbox="allow-scripts allow-forms allow-popups"
      srcDoc={srcDoc}
    />
  )
}
