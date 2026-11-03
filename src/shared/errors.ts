// Client RPC failures are structured objects, not necessarily Error instances.
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error) || "Unknown error"
  } catch {
    return "Unknown error"
  }
}
