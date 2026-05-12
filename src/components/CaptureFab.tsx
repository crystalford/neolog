/**
 * CaptureFab — Record / Upload pill above the dock.
 * Both buttons route to /capture; the page's mode picker handles record-vs-upload.
 */
export function CaptureFab() {
  return (
    <div className="capture-fab">
      <a href="/capture?mode=record">
        <span className="ico">
          <svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="3.5" /><circle cx="7" cy="7" r="6" opacity="0.4" /></svg>
        </span>
        Record
      </a>
      <span className="fab-divider" />
      <a href="/capture?mode=upload">
        <span className="ico">
          <svg viewBox="0 0 14 14"><path d="M7 1 L7 13 M3 5 L7 1 L11 5" /></svg>
        </span>
        Upload
      </a>
    </div>
  )
}
