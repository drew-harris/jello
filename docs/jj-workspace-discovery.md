# JJ workspace discovery validation

Validated 2026-11-06 using JJ 0.47.1 and OpenCode server/CLI 2.2.5.
These are server API tests, not desktop UI tests. No Jello runtime code changed.

## Result

**Native project discovery works for colocated secondary JJ workspaces.**
With this JJ version, `jj workspace add` creates a corresponding Git worktree
when the source workspace is colocated and `git.colocate` is enabled. OpenCode
can discover it through Git without a JJ-specific repository detector.

**Non-colocated secondary workspaces do not resolve to the same project.**
Jello still needs a JJ worktree strategy for creation/removal and correct
strategy ownership; discovery working does not make the bundled Git lifecycle
JJ-aware.

## Environment and isolation

- Updated the mise-managed JJ installation from 0.40.0 to 0.47.1.
- Full version: `0.47.1-d16ee1fc88a72c54142241b079a34bbf3b033bc0`.
- Confirmed `workspace remove` is available after the update.
- Fresh interactive zsh resolves the new mise-managed version.
- The existing agent process retains an old PATH. Plain `jj` there falls back
  to the separate Cargo installation, version 0.39.0. That installation was not
  overwritten. Tests explicitly prepended the 0.47.1 installation to PATH.
- Used scratch repositories and isolated XDG config/data/state/cache directories.
  Real repositories, OpenCode sessions, configuration, and databases were not used.
- Baseline tests used no Jello/custom worktree plugin.

Scratch artifacts are under:

```text
/private/var/folders/mg/_7p00yw171gbrm23n03z9_sr0000gn/T/opencode/jello-jj-discovery-c6yxmwyh
```

## Tests

| Test | Result |
| --- | --- |
| Create a colocated primary repo and commit a file | Pass |
| `jj workspace add secondary` | Creates `.jj` metadata and a `.git` file pointing to the primary's Git worktree metadata |
| `git worktree list --porcelain` | Lists both primary and secondary |
| OpenCode `GET /api/location` in each workspace | Same project ID; primary is canonical; each workspace retains its own project directory |
| Open secondary first using a fresh OpenCode database | Same project ID and correct primary canonical root, without prior primary discovery |
| OpenCode location lookup inside a nested secondary subdirectory | Correct project ID, secondary workspace root, and primary canonical root |
| Create another workspace without opening it, then `POST /api/worktree/refresh` | Newly created workspace appears in inventory |
| Run independent standalone API processes against the isolated database | Identity and inventory persist across server process lifetimes |
| `jj workspace add --no-colocate no-colocate` | No `.git`; OpenCode assigns a different project ID and makes that workspace its own canonical root |
| Create an OpenCode session in secondary | Correct shared project ID and secondary location |
| Move that session to primary, then back to secondary | Both moves complete, preserve project ID, and update the session location |
| Built-in OpenCode `POST /api/worktree` | Creates a Git-only checkout, without `.jj`; `jj root` fails there |

Session move tests used a persistent isolated server and waited for the returned
session state to reflect the destination. A move is asynchronous: successful
request admission alone is not proof that relocation completed. Stopping a
standalone server immediately after admission is not a valid completion test.
The persistent test server was stopped and test sessions were deleted afterward.
The Git-only checkout created for the native-create test was also removed through
the worktree API.

## Implications for Jello

1. Target colocated JJ workspaces first; the tested versions need no discovery
   change for those workspaces.
2. Register a JJ worktree strategy to create actual JJ workspaces, preserve sparse
   patterns/source semantics, and remove through JJ-aware operations.
3. OpenCode currently records discovered secondary checkouts as `strategy: "git"`.
   Recorded ownership matters: do not assume registering a new strategy safely
   reassigns existing inventory or fixes removal of previously discovered entries.
   Validate ownership/adoption separately before exposing native removal.
4. Use `jj workspace add --colocate` when promising native discovery, and validate
   backend capabilities. Do not silently assume all repositories/configurations
   produce Git-visible workspaces.
5. Treat non-colocated support as a separate project-association problem. These
   tests did not establish whether a custom strategy's saved inventory can supply
   association for such directories.
6. Existing long-running processes may need their execution environment refreshed
   to pick up the new mise path; the machine update does not rewrite inherited PATHs.

These results supersede the earlier investigation's missing-`.git` discovery risk
for newly created **colocated workspaces on JJ 0.47.1**. They do not establish that
pre-existing non-colocated workspaces are automatically converted by upgrading JJ.
