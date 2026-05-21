/**
 * CaptureFab — floating "drop a vlog" pill.
 * Routes to /vlogs?capture=open which auto-opens the CapturePanel.
 * The standalone /capture page was killed in Phase 7.5.
 */
export function CaptureFab() {
  return (
    <div className="capture-fab">
      <a href="/vlogs?capture=open">
        <span className="ico">
          <svg viewBox="0 0 14 14"><path d="M7 1 L7 13 M3 5 L7 1 L11 5" /></svg>
        </span>
        Drop a vlog
      </a>
    </div>
  )
}
