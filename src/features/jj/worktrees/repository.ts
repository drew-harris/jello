import { lstat, readFile, realpath, stat } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"

export function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT"
}

export function contains(parent: string, child: string) {
  const path = relative(parent, child)
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`))
}

export function absolutePath(value: string) {
  if (!isAbsolute(value) || value.includes("\0")) throw new Error("Expected an absolute workspace path.")
  return resolve(value)
}

// Filesystem-only detection keeps ordinary Git projects and plugin setup cheap.
// Resolve the actual store, not just the workspace path: .jj/repo may be a link
// file, a directory, or a symlink. Paths are local to this server, never the GUI.
export async function jjRepository(directory: string): Promise<{ root: string; store: string; main: boolean } | undefined> {
  let root = await realpath(absolutePath(directory))
  for (;;) {
    const metadata = join(root, ".jj")
    try {
      await lstat(metadata)
      const pointer = join(metadata, "repo")
      const info = await stat(pointer)
      const store = await realpath(info.isDirectory() ? pointer : resolve(metadata, await readFile(pointer, "utf8")))
      return { root, store, main: info.isDirectory() }
    } catch (error) {
      // A .jj entry with broken/inaccessible metadata is not an ordinary Git
      // checkout. Never silently fall back to Git mutation in that case.
      if (!missing(error)) throw error
      try { await lstat(metadata) } catch (entryError) {
        if (!missing(entryError)) throw entryError
        const parent = dirname(root)
        if (parent === root) return
        root = parent
        continue
      }
      throw new Error(`JJ metadata is incomplete at ${metadata}. Repair it before managing workspaces.`, { cause: error })
    }
  }
}
