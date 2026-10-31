export function revisionAge(timestamp: string, now = Date.now()): string {
  const elapsed = now - Date.parse(timestamp)
  if (!Number.isFinite(elapsed)) return "Unknown time"
  const seconds = Math.max(0, Math.floor(elapsed / 1000))
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 86400 * 365) return `${Math.floor(seconds / 86400)}d ago`
  return `${Math.floor(seconds / (86400 * 365))}y ago`
}
