# Jello

Jello: an OpenCode Desktop GUI plugin.

## JJ feature

Press **⌘⇧J** to open JJ Tree and focus it for keyboard navigation (even if it is
already open). This app-wide shortcut also works from text fields and is
customizable under **Settings > Shortcuts**.
Run `/tree` (or `/jj`), or choose **Open JJ Tree** in the command palette (⌘⇧P),
to open the **JJ Tree** panel for the current session's directory. It renders a
native commit list with colored SVG ancestry lanes, working-copy rings, immutable
diamonds, bookmarks, and conflict/divergence badges. Requires `jj` on the OpenCode
server's PATH.

The view respects the repository's default `jj log` revset. Dashed, capped edges
indicate parents outside the displayed history; they do not infer connections
through hidden revisions. Load more adds 100 revisions at a time (up to 2,000).
Each commit row shows its subject, author and age; there is no separate selection
details pane. Use ↑/↓ to navigate, Enter or double-click to open a diff, and **@**
to jump to the working copy. Refresh runs every 10 seconds while the window is
visible, when returning to the app, reopening the panel, and after committing;
the toolbar also has a manual refresh action. Requests never overlap.

Right-click a change and choose **Abandon** to run `jj abandon` on that exact
commit. Immutable changes have the action disabled. JJ rebases descendants onto
the abandoned commit's parents; abandoning the working copy starts a new empty
change. The tree and status bar refresh after success, and errors appear as toasts.

**Edit** runs `jj edit` on the clicked mutable change, switching the working copy
to it. A progress toast stays visible during the operation, then the tree and
status bar refresh. Immutable changes cannot be edited.

**Squash below** (or **Shift+S** while the tree is focused) squashes the selected
change into a direct parent, not the next visible row. The dialog loads parent
details, including parents outside the current log, and asks you to choose when
there are multiple parents. Immutable sources and destinations are protected.
When both descriptions are nonempty, review a multiline editor prefilled with
the parent's description, a blank line, and the source's description. Otherwise
the one nonempty description is kept (or the result stays empty). Confirming
runs `jj squash --from … --into … --message …` without a terminal editor, removes
the source change, and refreshes the tree and status bar. Errors stay in the dialog.

**Set bookmark** opens a searchable bookmark picker. Choose an existing name to
move it to the clicked commit (including backwards or sideways), or type a new
name to create it. Use ↑/↓ for suggestions and Enter to save. Bookmark lists are
cached for 30 seconds and invalidated after setting a bookmark; failures stay in
the modal, and success refreshes the tree and status bar.

⌘⇧-click a change, or choose **Describe** from the same menu, to replace a mutable commit's description
with a single line. The input starts with its current subject; press Enter to save
or cancel to leave it unchanged. Failures remain visible in the modal.

⌘-click a change to expand or collapse its changed-file list inline, with file
paths and added/modified/deleted markers. The list reads that exact commit, not
the current working copy. Use →/← to expand/collapse with the keyboard. Graph
connections adjust to the expanded rows; long file lists scroll independently.
Expanded changes are remembered per session and directory when leaving and
returning to the panel.

While keyboard focus is inside the tree, a keyboard icon appears to the left of
the repository header. Use **j/k** to select down/up, **n** to create a new change
on the selection, **Shift+B** to set a bookmark, **l** to expand its files, and
**a** to abandon it after confirmation, **d** to open its diff, **e** to edit it
(switch the working copy with `jj edit`), and **Enter** to
open Describe. Selecting another change collapses other
expanded lists. These shortcuts do not run in text fields, dialogs, or menus;
immutable changes cannot be abandoned.

Click a file to select it inside the change's **JJ Diff** tab with the file tree
hidden. Its toolbar can show the file tree again. Opening the whole change or
another file reuses the same tab rather than creating duplicates. Normal tabs
are keyed by repository directory and full JJ change ID, so snapshots and rewrites
do not change their identity. Divergent versions use separate exact-commit tabs.
Older saved commit/file tab IDs remain readable and are reused when identifiable.

A compact, read-only bottom toolbar shows cards for the current revision, parents,
and grandparents:
purple change IDs, blue bookmarks and lock icons for immutable revisions, lime empty markers
(○), and truncated descriptions. Line counts sit next to Commit: yellow `~` for
replacements, green `+` for added lines, and red `−` for deleted lines. Removed and
added lines are paired within each contiguous edit block to count replacements
without double-counting; binary changes do not contribute text lines. Conflicts are
highlighted. Parent details hide on narrow windows. It refreshes
every 10 seconds while the window is visible, and on focus. Open the
tree panel with `/tree`; hover over the status to see the raw output or error.

Click **Parent** or **Earlier** to open a **JJ Diff** tab for that change.
The viewer uses [Pierre Diffs](https://diffs.com/) with syntax highlighting,
unified/split layouts, line wrapping, and a searchable changed-file list. Tabs
remain pinned to their original directory and stable change ID (or exact commit
for divergent versions). Historical tabs resolve the latest version when reopened
or refreshed. A diff of the current working copy shows **@ working copy** and
refreshes about every 3 seconds while visible, when its tab is selected, and on window
focus. It snapshots file edits and follows the same change across rewritten
commit hashes; switching to another working-copy change stops live updates rather
than changing this tab's target. Refreshes retain the existing diff, selected file,
filter, and sidebar, with a small progress indicator and inline retry on failure.
Polling waits for each request to finish, slows down for slow repositories and
errors, and coalesces focus events. Unchanged revisions skip diff generation,
patch transfer, parsing, and rerendering. Background refreshes never replace the
view with a loading screen; the renderer updates in place.
With focus inside JJ Diff, **Ctrl+D / Ctrl+U** smoothly scroll down/up by half
the diff viewport; **j / k** scroll down/up by two lines.
Holding either pair scrolls continuously using a single frame-driven animation,
without waiting for OS key repeat or restarting smooth scrolling on every tick.
Click the diff or Tab into the panel to focus it. Search fields and dialogs retain their normal keys,
and reduced-motion preferences disable the scrolling animation.

The toolbar's **Multi-file mode** toggle stacks all changed files in one scroll
view using Pierre Diffs' native virtualized `CodeView`, with sticky file headers.
Only visible hunks are rendered, so large changes don't mount every diff at once.
The file tree and previous/next actions jump to a file in the stack; scrolling
updates the selected file. Split/unified layouts, wrapping, Vim scrolling, and
live working-copy refresh work in both modes. Switching modes uses the already
loaded patch and does not issue extra JJ commands.
Tabs can be reopened after closing. Binary and metadata-only changes show a summary
rather than text hunks.

### Definition and reference peeks

If the language service gets stuck, run **Restart TypeScript language server**
from the command palette, the symbol right-click menu, or an LSP error message.
It replaces the language-server process for the current workspace and clears its
open-document state, pending lookups, peek previews, and occurrence highlights.
Other workspaces are unaffected. Progress and failures appear as toasts; after a
successful restart, the next lookup reloads the TypeScript project.

Plain-click a TypeScript/JavaScript variable to highlight its occurrences in the
same file using thin rounded outlines and a subtle background tint, keeping
syntax colors intact. Highlights use LSP symbol identity, not word matching, so
shadowed variables are excluded. They remain visible while scrolling in either
diff mode; click an already-highlighted occurrence again or press **Escape** to
clear them. This does not open a peek or search the whole repository. A small
status indicator shows progress during the first language-server lookup.

Right-click a TypeScript/JavaScript symbol on the working-copy side, then choose
**Peek definition** or **Peek references** from its context menu. With a symbol
selected, **F12** peeks its definition and **Shift+F12** peeks references;
**Shift+F10** or the context-menu key opens its menu.
**Cmd/Ctrl-click** opens a definition peek directly; add **Shift** for references.
**Cmd/Ctrl-right-click** opens references directly, skipping the context menu.
Both actions open a read-only pane below the diff, without navigating away or
resetting its scroll position. Select a result to preview syntax-highlighted source
using the diff's light/dark palette, with the target symbol emphasized. When there
is only one result, the sidebar is hidden and its file path appears in the peek
header instead. **Escape** closes the pane. Works in single-file and multi-file modes.
An unambiguous definition in the same file scrolls directly to its line in the
diff and emphasizes the definition's symbol instead of opening a peek. Definitions
outside the loaded diff hunks still use the source preview, as do other-file and
multiple-definition results. References continue to use the peek pane.

The bundled TypeScript language server runs on the session's OpenCode server,
beside the checkout; no global language-server installation or Electron IPC is
needed. **Node.js 22.22.2+ must be on that server's PATH.** It starts on the first
lookup, is reused for subsequent requests, and
stops after ten idle minutes or plugin unload. Initial project loading may take
a moment on large repositories. Results are capped at 500 and source previews
load on demand. References exclude the declaration itself.

Historical revisions and the deleted/left side are intentionally unsupported;
they never silently query the current checkout. If a displayed source line has
changed since the diff loaded, refresh it before trying again. Language support
is currently TypeScript/JavaScript, including TSX/JSX. The language server prefers
the workspace's TypeScript installation, with bundled TypeScript as a fallback; project configuration and
installed dependencies determine resolution accuracy.

The **Commit** button or `/commit` opens a message dialog. Confirming runs `jj commit -m`,
committing all working-copy changes and starting a new empty change. Canceling
makes no changes; failures remain visible in the dialog.

An [OpenCode Desktop](https://opencode.ai) GUI plugin, built with the experimental
[GUI plugin SDK](https://opencode.ai/v2/docs/build/plugins/gui) (`@opencode/plugin/gui`).

> The GUI plugin API is experimental and may change between releases.

## What's inside

```
src/
├── index.ts            Server part: Plugin.define from @opencode/plugin (id "jello")
├── rpc.ts              Shared/demo RPC contract
├── gui.tsx             ./gui-experimental entry: Plugin.define({ ...definition, setup })
├── features/
│   └── jj/             Self-contained JJ feature
│       ├── server.ts   Server registration
│       ├── rpc.ts      JJ RPC contract
│       ├── status.ts   Runs jj status
│       ├── overview.ts Structured revision metadata and jj log template
│       ├── overview.test.ts
│       ├── gui.tsx     JJ Tree panel, commands, launcher, and bars
│       ├── panel.tsx   Session-scoped tree boundary
│       ├── tree/       Structured history, lane layout, SVG/list components, tests
│       ├── status-bar.tsx
│       ├── status-summary.ts
│       ├── status-summary.test.ts
│       └── style.css
└── gui/
    ├── definition.ts   Stored state declarations
    ├── window.tsx      Shared setup and feature composition
    ├── settings.tsx    Settings page component
    └── style.css       Styles injected with ctx.add(Style, css)
```

New features belong in their own `src/features/<name>/` directory. Register their
server and GUI setup functions from `src/index.ts` and `src/gui/window.tsx`.
Feature IDs and CSS are namespaced so they do not collide with other Jello
features. UI text is plain English inline; there is no internationalization layer.

## Develop

```sh
bun install
bun run dev        # vite build --watch → dist/gui-experimental.cjs
```

Add the plugin's directory to your **global** OpenCode config, `~/.config/opencode/opencode.jsonc`
(the desktop app does not read `cli.json`):

```jsonc
{
  "plugins": ["/Users/drew/programs/jello"],
}
```

Config changes load automatically; use `/reload` to force a full reload. Every rebuild reloads the plugin's GUI in every window.
Find it under **Settings > Extensions > Plugins**, run **Jello** commands from the command palette, or open its
panel from the side panel's **+** menu.

## Scripts

| Script              | What it does                            |
| ------------------- | --------------------------------------- |
| `bun run build`     | Builds `dist/gui-experimental.cjs` once |
| `bun run dev`       | Rebuilds on every change                |
| `bun run typecheck` | Type-checks the project with `tsc`      |

## Publish

`bun run build` runs before `npm publish` (`prepublishOnly`). Users then add the package name to
`plugins` in their `opencode.json(c)`; there is no separate GUI install step.

## Notes

- Only import shared modules the app provides (`effect`, `solid-js`, `solid-js/web`, `solid-js/store`,
  `@opencode/plugin/gui`, `@opencode/plugin/rpc`, `@opencode/client`, …). The build fails on any other
  `effect/*`, `solid-js/*`, or `@opencode/*` module.
- Both processes evaluate the same bundle. Keep window code inside `setup` and main-process code inside `main`;
  each process sees inert placeholders for the other's modules.
- Token ids (`Ipc`, `Contract`, `Registry`) must be the plugin id or start with `jello.`.
