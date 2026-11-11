# Shared feature primitives

Features still register ordinary server and GUI setup functions. There is no
feature registry or generic Git/JJ layer. JJ owns its commands, revision identity,
graph, query keys, patch caching, and mutation rules.

## Layout

| Module | Responsibility |
| --- | --- |
| `src/shared/gui/query.ts` | Window-owned Solid Query client, completion-aware polling/backoff, visibility, and batched non-cancelling invalidation |
| `src/features/jj/queries.ts` | JJ query keys and read options shared by observers, dialog reads, and prefetching |
| `src/features/jj/mutations.ts` | JJ writes and their centralized success-invalidation policy |
| `src/shared/gui/view-models.ts` | Reference-counted cache for Solid-only diff navigation state, not remote data |
| `src/shared/repository.ts` | Server/directory identity |
| `src/shared/gui/repository.ts` | Window-provided query services and local mutation gates |
| `src/shared/gui/async-action.ts` | Submission guards, pending/error state, optional progress/success/error toasts and guaranteed cleanup |
| `src/shared/gui/action.ts` | An action's presentation, availability reason and guarded invocation shared by menus and shortcuts |
| `src/shared/gui/context-menu.ts` | Placement, focus, dismissal, shadow-DOM-safe outside clicks and menu keyboard handling |
| `src/shared/server/command.ts` | Shell-free execution, cancellation, explicit timeout/output limits and structured command failures |
| `src/shared/server/async-cache.ts` | Bounded TTL/single-flight cache; a cancelled waiter cannot abort other readers |
| `src/features/intelligence/` | Workspace LSP backend/RPC, restart action, symbol menu and reusable peek/source-preview UI |

## Query and UI-state lifetimes

GUI setup creates one `@tanstack/solid-query` client for the plugin window and
disposes it on unload. Contributions are separate host render roots, so pass this
client explicitly to `useQuery` instead of relying on a provider above the host.

JJ keys include server ID, workspace directory, read kind, and its parameters.
History limits and revision targets cannot collide; different conversations in
the same workspace share remote data. The server does not yet expose canonical
store/workspace IDs to these reads, so aliases and sibling workspaces are not
merged. Immutable revision-file lists use a separate prefix and infinite
freshness; mutations do not invalidate them. Moving-change diffs still resolve
their latest commit, retaining parsed file identities for unchanged content.

Use the options in `queries.ts` for both `useQuery` and `prefetchQuery`/`fetchQuery`.
Query owns deduplication, cached data, errors, cancellation and five-minute unused
query garbage collection. Removing the last observer cancels its consumed RPC
signal; successful results survive remounts. Unload cancels all work and clears
the cache. `queryData()` avoids suspending on an initial pending result; failed
background refreshes retain the previous data and show an inline error.

Polling uses Query's interval and focus policies, with a small remote-repository
policy: intervals stop during requests and restart from completion, slow reads
increase the delay, and failures add exponential backoff. Automatic retries are
disabled. Manual refresh uses `cancelRefetch: false`, so it cannot restart an
expensive in-flight JJ command. Hidden host panels disable their observers using
`createViewVisibility`; they retain data and invalidation without polling.

JJ Tree prefetches history and session positions on explicit navigation intent,
before opening the panel. Presence has independent loading/error state and
polling, so a slow presence read never delays history. Source browsing and LSP
queries remain scoped to their existing file-view/peek lifetimes.

Solid signals and stores own selection, filters, sidebar dimensions and persisted
preferences. Only diff navigation state needs the window-owned `ViewModels`
cache; it contains no remote requests or data. No second client-state library is
needed.

## Mutations and invalidation

Capture the repository, client and exact target IDs **before** opening a dialog
or awaiting confirmation. Polling can reconcile commit objects while the dialog
is open; never read a mutable row object's commit ID when submitting later.

```ts
const repositories = repositoryServices(ctx)
const repository = sessionRepository(session)
const writes = createJJMutations(repositories.queries, repository, session.server.client)
const action = createAsyncAction({ toast: ctx.toast, gate: repositories.gate(repository) })

await action.run(() => writes.describe(commitID, message), {
  progress: "Saving…", success: "Saved",
})
```

Every JJ write goes through `createJJMutations`, which records a TanStack mutation
and invalidates the workspace's mutable JJ query prefix only on success. Dialogs
and menus do not separately publish refresh events. Invalidations batch in one
microtask. If a matching query is already reading, it finishes without being
cancelled and performs at most one follow-up read. Hidden or unmounted queries
remain invalidated until used again. Mutation success does not await slow reads.

The client cache is window-local, not repository truth. External JJ changes still
need polling; there are no cross-window events or server-side request deduplication
introduced by this migration. Server single-flight caches remain useful across
clients.

Gates prevent competing mutation submissions across components in the same
window/repository. They are not distributed locks across windows or clients.
Dialog callers use `rethrow: true` so the dialog retains failures and stays open;
validation, confirmation, close behavior and success wording remain feature-owned.

## Language intelligence boundary

The intelligence feature has no production JJ imports. `FileView` is a reusable,
read-only source browser; peeks are just one consumer. The layers are:

- `client.ts`: transport interface and session-RPC adapter.
- `file-model.ts`: full-document loading, bounded eight-document cache,
  back/forward history, results, selection and cancellable language queries.
- `file-code.tsx`: native virtualized `CodeView` with a full-file item, token
  gestures and occurrence overlays, not thousands of individually mounted rows.
- `file-view.tsx`: navigation/query toolbars, result list, hover and error UI.
- `peek-panel.tsx`: thin modal launch shell supplying an initial result set.
- `rpc.ts`/`queries.ts`: typed location-query catalog and presentation metadata;
  definition, references, type definition and implementation reuse one pipeline.

Call `createFileViewModel(client)` under a Solid owner, seed it with `FileResults`
or call `navigate(location)`, then render `<FileView model={model} directory={root}
/>`. A client can be the session adapter or another implementation of
`LanguageClient`. Owners must reset/dispose their model when the workspace or LSP
generation changes; the diff adapter already closes/disposes its peek on those
events. Refreshing source preserves existing text and scroll position, and never
silently queries mismatched text. Queries are explicit, not fired on mouse moves.

The server permits full document reads inside the workspace, plus canonical
outside-workspace paths authorized by LSP results. It blocks symlink escapes to
unauthorized files, validates displayed source lines before every position query,
bounds files to 4 MiB/results to 500, and disposes idle services. Merely browsing
a workspace file does not start the language server. Hover is returned/rendered
as bounded plain text, never executable HTML. The legacy cropped `source` RPC is
retained for compatibility; the new UI uses `document`. Existing contract and
restart-command IDs remain unchanged. Run `/reload` when adopting new server RPC
methods; rebuilding alone reloads only the GUI.

`src/features/jj/diff/intelligence/` contains only the diff adapter: token/side
mapping, historical-revision restrictions, local definition jumps, highlights,
and diff-specific focus behavior. The adapter passes the existing JJ syntax theme
to the shared file view; other consumers can use its default light/dark themes.
Source-view keyboard events are scoped away from the enclosing diff's scroll and
symbol handlers.

Peeks use a portaled native `<dialog>` in the browser's modal top layer, with
32px viewport margins (16px in small windows). Native inertness and focus trapping
keep background panes out of keyboard navigation. File-query menu portals mount
inside the dialog so they do not become inert underneath it. Owner cleanup closes
the dialog, and native plus diff-adapter focus restoration return to the trigger.
Opening a host dialog dismisses the peek so host dialogs cannot get trapped below
the native modal.

## Verification

```sh
bun run test
bun run typecheck
bun run build
```

The test script selects Solid's browser condition so reactive-model, scheduling,
and lifecycle tests run rather than silently skipping under SSR. These tests do
not require a DOM: menu controllers and query policies/lifecycles run in isolation.
JJ integration tests use disposable repositories; language-service tests start a
real bundled TypeScript language server. `jj` and a supported `node` must be on PATH.

`src/features/jj/repository.test.ts` exercises a real commit through the server
RPC handlers and the central mutation policy, proving that invalidation refreshes
history, status and diff once each while retaining diff-file identity, filtering
and sidebar state. Query tests cover shared observers, prefetch/remount reuse,
cancellation, visibility deferral, refresh errors/backoff and identity isolation.

Automated tests do not replace a visual smoke test in OpenCode Desktop: check tree
focus/menu dismissal, mutation dialogs, both diff modes, peeks, and tab/session
switches after changing the host SDK or UI integration.

`bun run test:gui` serves `tests/gui/` at `http://127.0.0.1:5180`. This isolated
browser harness uses mock LSP responses and minimal host controls, but the actual
`FileView`, model, menus, shadow-DOM token interactions and virtualized renderer.
It is separate from the real-language-server integration tests and never modifies
a repository. See `tests/gui/README.md` for the smoke-test checklist.
