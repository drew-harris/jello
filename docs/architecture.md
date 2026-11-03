# Shared feature primitives

Features still register ordinary server and GUI setup functions. There is no
feature registry or generic Git/JJ layer. JJ owns its commands, revision identity,
graph, patch caching, mutation rules, and dependency tags.

## Layout

| Module | Responsibility |
| --- | --- |
| `src/shared/gui/view-models.ts` | Window-owned, reference-counted model cache; unused-model eviction and explicit navigation preloading |
| `src/shared/gui/resource.ts` | SDK `createLatest` resources, configuration deduplication, retained data, cancellation, coalesced invalidation, completion timing and backoff |
| `src/shared/gui/poll.ts` | Visibility/focus-aware refresh scheduling; no overlapping reads, no queued interval ticks |
| `src/shared/repository.ts` | Server/directory identity and batched, tag-based invalidation |
| `src/shared/gui/repository.ts` | Window-provided repository event bus and mutation gates |
| `src/shared/gui/async-action.ts` | Submission guards, pending/error state, optional progress/success/error toasts and guaranteed cleanup |
| `src/shared/gui/action.ts` | An action's presentation, availability reason and guarded invocation shared by menus and shortcuts |
| `src/shared/gui/context-menu.ts` | Placement, focus, dismissal, shadow-DOM-safe outside clicks and menu keyboard handling |
| `src/shared/server/command.ts` | Shell-free execution, cancellation, explicit timeout/output limits and structured command failures |
| `src/shared/server/async-cache.ts` | Bounded TTL/single-flight cache; a cancelled waiter cannot abort other readers |
| `src/features/intelligence/` | Workspace LSP backend/RPC, restart action, symbol menu and reusable peek/source-preview UI |

## Resource lifetimes

Create a `ViewModels` cache in GUI setup, then acquire a model with `use()` inside
a component. The model's reactive root belongs to the window, not to the first
component using it. Unmounting a view releases its reference but preserves data
and navigation; eviction or window cleanup disposes the model and aborts its work.

Keep polling and event subscriptions in the mounted view. A resource accepts an
input through `configure()`, exposing its SDK state as `result.latest`,
`result.loading`, and `result.error`. A failed refresh retains the last successful
data. Forward its `AbortSignal` to RPC calls.

`refresh()` ignores overlapping requests. `invalidate()` remembers an invalidation
during a request and performs one follow-up read. Hidden views use
`invalidate({ defer: true })` to mark data stale without running expensive remote
commands. Pass the model's `stale` accessor to `createPolling`; focus/visibility
or a panel's existing activation callback can then refresh it. A background
failure uses the completion-based delay/backoff rather than hammering the server.

Use `preload()` only for explicit navigation intent. JJ Tree starts its request
before opening the panel, using the session's saved history limit.

## Mutations and invalidation

Capture the repository, client and exact target IDs **before** opening a dialog
or awaiting confirmation. Polling can reconcile commit objects while the dialog
is open; never read a mutable row object's commit ID when submitting later.

```ts
const repositories = repositoryServices(ctx)
const repository = sessionRepository(session)
const action = createAsyncAction({
  toast: ctx.toast,
  gate: repositories.gate(repository),
})

await action.run(save, {
  progress: "Saving…",
  success: "Saved",
  onSuccess: () => repositories.events.invalidate(repository, ["feature.items"]),
})
```

Subscribe with `observeRepository()` while mounted. Tags are feature-owned;
`src/features/jj/invalidation.ts` declares the JJ mutation tags. Multiple
invalidations in one microtask notify each matching subscriber once. Both the
server ID and directory participate in identity, so changes in one remote checkout
do not refresh an unrelated server or directory.

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
not require a DOM: menu and polling controllers use deterministic test environments.
JJ integration tests use disposable repositories; language-service tests start a
real bundled TypeScript language server. `jj` and a supported `node` must be on PATH.

`src/features/jj/repository.test.ts` exercises a real commit through the server
RPC handlers, proving that batched invalidation refreshes history, status and diff
once each while retaining diff-file identity, filtering and sidebar state.

Automated tests do not replace a visual smoke test in OpenCode Desktop: check tree
focus/menu dismissal, mutation dialogs, both diff modes, peeks, and tab/session
switches after changing the host SDK or UI integration.

`bun run test:gui` serves `tests/gui/` at `http://127.0.0.1:5180`. This isolated
browser harness uses mock LSP responses and minimal host controls, but the actual
`FileView`, model, menus, shadow-DOM token interactions and virtualized renderer.
It is separate from the real-language-server integration tests and never modifies
a repository. See `tests/gui/README.md` for the smoke-test checklist.
