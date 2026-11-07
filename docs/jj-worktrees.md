# JJ worktree adapter

The adapter is part of Jello's server plugin, with strategy ID `jello.jj`. It uses
OpenCode's native worktree lifecycle; there is no separate workspace database or
desktop-local filesystem implementation. Install Jello and JJ on the server that
owns the repository. The existing JJ Tree, diff and status RPCs work in the new
workspace without special GUI routing.

## Defaults

- Registers only where the canonical project directory belongs to a JJ repo.
  Detection uses filesystem metadata, not a working-copy snapshot or Git scan.
- Uses `jj workspace add --colocate --sparse-patterns=copy -r @`: one source
  snapshot and a new child change, leaving the source working copy in place.
- Explicit starting refs must resolve to one commit. They are pinned before
  creation; native `branch` means starting ref, not a new bookmark name. Ref
  resolution is non-snapshotting; literal `@` resolves during workspace creation
  so it includes current edits. Other revsets containing `@` use the last snapshot.
- Generates a unique workspace name independent of destination basename, so two
  workspaces named `task` in different directories do not collide in JJ.
- Preserves the source's sparse patterns instead of expanding a large repo.
- Lists through a structured, non-snapshotting JJ template. No checkout-content
  scans, default-log traversal, fetches, full diffs, background timers or eager
  workspace discovery at plugin startup.
- Uses OpenCode's saved inventory for normal UI reads. Explicit refresh probes
  workspace metadata sequentially and skips missing/unavailable root records.
  Permission errors and malformed metadata fail discovery instead of pretending
  the repository is empty.

Creation/removal have a ten-minute command budget; metadata reads have thirty
seconds. All command output is bounded and operations honor cancellation. JJ
capabilities are checked lazily and cached after success. Creation/removal are
serialized per resolved JJ store within the server process, including across
Jello location instances. Other stores are independent.

## Configuration

Use Jello's existing plugin entry; do not add a second copy of the plugin. Example:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "worktree": { "directory": "../worktrees" },
  "plugins": [
    {
      "package": "opencode-jello",
      "options": {
        "jjWorktrees": {
          "command": "jj",
          "colocate": true,
          "sparsePatterns": "copy",
          "start": "current",
          "readTimeoutMs": 30000,
          "writeTimeoutMs": 600000,
          "maxOutputBytes": 8388608
        }
      }
    }
  ]
}
```

All fields are optional; the example shows defaults. Unknown fields and invalid
budgets are rejected. `command` is one executable/path, not shell text; it can
point to a site-specific JJ wrapper for unusual storage/configuration needs.
Only the adapter uses this override; other Jello JJ actions still use `jj` on PATH.

- `sparsePatterns`: `copy`, `full`, or `empty`. `empty` permits a cheap, initially
  unpopulated checkout; expand it deliberately with JJ later.
- `start`: `current`, or `parents` for JJ's native sibling-change behavior. An
  explicit starting ref overrides this default. Multi-parent sources are left to
  JJ rather than flattened into a single Git-style branch.
- `colocate`: defaults to `true` for OpenCode project discovery. `false` is an
  advanced escape hatch: OpenCode 2.2.5 resolves these directories as separate
  projects **even when created through its worktree API**. The adapter can manage
  them, but does not repair native project grouping. Primary non-colocated repos
  also need host-discovery validation. Creation is refused while OpenCode still
  identifies the project as `global` (for example before its initial commit),
  rather than saving a workspace under a project identity that may change.
- `jjWorktrees: false`: leave the previous/bundled strategy selected. Recorded
  Jello-owned entries still require the adapter enabled to remove them.

OpenCode activates worktree strategies from the project's canonical checkout.
Changing `from` changes the source workspace, not the configuration root. Local
plugin option changes are hot-reloaded by OpenCode; use `/reload` when adopting
new server implementation code, rather than relying on a GUI-only rebuild.

## Removal and recovery

Jello removes through `jj workspace remove`, never recursive filesystem deletion,
`git worktree remove`, or a `workspace forget` fallback. The directory must be an
exact registered workspace root in the same JJ store. The main/canonical
workspace, root symlinks, unrelated repos and parents of other registered JJ
workspaces are refused even with force. Repository identity is rechecked before
the destructive command. Renamed JJ workspace names are resolved from inventory.

Without force:

1. Snapshot/check the target's working-copy change. Nonempty changes request
   OpenCode's force confirmation using `Worktree.OperationError`.
2. Sparse checkouts require confirmation because out-of-pattern files may not
   be snapshotted.
3. Require a matching Git checkout, with no untracked/ignored files or directories.
   The check includes ignored build outputs, but collapses untracked directories
   instead of recursively enumerating their contents. Submodule-layout markers
   or an inconclusive safety check require force too.

**Force permanently deletes ignored/untracked files.** JJ snapshots tracked edits
as part of removal; this is not a backup of everything on disk. Stop editors,
builds and other writers before removing a workspace. Jello checks this server's
session busy/idle markers in paginated reads and refuses removal while a running
session uses the target, including force removal. This check is best-effort, not
a filesystem lock, and cannot detect another server, external process or every
background task.

Stale working copies are not automatically repaired. Follow JJ's error and inspect
the workspace before deciding to run `jj workspace update-stale`. A cancelled,
timed-out or failed creation can leave a partial workspace. Jello leaves it intact
and reports the destination and underlying failure; inspect JJ inventory and files
before retrying. Removal failures likewise propagate rather than claiming success.

Destinations must not overlap existing JJ workspaces; use a separate checkout
directory rather than nesting under tracked files. Symlinked parent directories
are normalized. JSON-escaped paths/names, long timeouts, configurable output
limits and resolved store identity accommodate spaces, Unicode, external store
links and remote filesystems without shell interpolation.

## Ownership and concurrency limits

OpenCode preserves a worktree's recorded owner. New native creates are tested to
remain `jello.jj`-owned after refresh, even though Git also discovers colocated
workspaces. Previously Git-owned checkouts are **not automatically migrated**;
do not assume their native Remove button invokes Jello's safety checks. Manage
legacy JJ workspaces with JJ directly until host-level ownership migration exists.

The queue is local to the server process and only covers adapter operations.
It is not a lock against Jello history mutations, JJ commands in terminals, or
other OpenCode servers. JJ handles concurrent operations, but users still need
to resolve stale checkouts, divergent operations and conflicts. This feature
does not synchronize independent clones or copy OpenCode sessions between servers.

## Tests

```sh
bun --conditions=browser test src/features/jj/worktrees/strategy.test.ts
JELLO_TEST_OPENCODE=1 bun --conditions=browser test src/features/jj/worktrees/native.test.ts
```

The opt-in native test uses isolated repositories/configuration/data directories,
the installed OpenCode CLI and no model calls. It verifies Jello loading, native
create/discovery/refresh/ownership/removal, a real Jello status RPC in the new
workspace, and the non-colocated project-grouping limitation. Tested with JJ
0.47.1 and OpenCode 2.2.5; desktop UI interactions and genuinely huge/remote repos
still need hands-on validation.
