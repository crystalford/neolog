export const SELECTED_PUBLICATION_STORAGE_KEY = 'selectedPublicationId'
export const SELECTED_PUBLICATION_EVENT = 'neolog:selectedPublicationChanged'

export function readSelectedPublicationId(): string | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(SELECTED_PUBLICATION_STORAGE_KEY)
  return raw && typeof raw === 'string' ? raw : null
}

export function writeSelectedPublicationId(publicationId: string | null) {
  if (typeof window === 'undefined') return

  if (publicationId) {
    window.localStorage.setItem(SELECTED_PUBLICATION_STORAGE_KEY, publicationId)
  } else {
    window.localStorage.removeItem(SELECTED_PUBLICATION_STORAGE_KEY)
  }

  window.dispatchEvent(
    new CustomEvent(SELECTED_PUBLICATION_EVENT, {
      detail: { publicationId },
    })
  )
}

export function onSelectedPublicationIdChange(
  handler: (publicationId: string | null) => void
): () => void {
  if (typeof window === 'undefined') return () => {}

  const onCustom = (event: Event) => {
    const custom = event as CustomEvent
    const next =
      custom?.detail && typeof custom.detail.publicationId === 'string'
        ? (custom.detail.publicationId as string)
        : null
    handler(next)
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== SELECTED_PUBLICATION_STORAGE_KEY) return
    handler(readSelectedPublicationId())
  }

  window.addEventListener(SELECTED_PUBLICATION_EVENT, onCustom)
  window.addEventListener('storage', onStorage)

  return () => {
    window.removeEventListener(SELECTED_PUBLICATION_EVENT, onCustom)
    window.removeEventListener('storage', onStorage)
  }
}
