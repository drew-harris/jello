# Jello

Jello: an OpenCode Desktop GUI plugin.

## JJ feature

Run `/jj` to open the **JJ** side panel with `jj status` for the current session's
directory. Run it again or click **Refresh** to update the output. Requires `jj`
on the OpenCode server's PATH.

A compact, read-only bottom toolbar shows cards for the current revision, parents,
and grandparents:
purple change IDs, blue bookmarks and lock icons for immutable revisions, lime empty markers
(○), and truncated descriptions. Line counts sit next to Commit: yellow `~` for
replacements, green `+` for added lines, and red `−` for deleted lines. Removed and
added lines are paired within each contiguous edit block to count replacements
without double-counting; binary changes do not contribute text lines. Conflicts are
highlighted. Parent details hide on narrow windows. It refreshes
every 10 seconds while the window is visible, and on focus. Open the
full status panel with `/jj`; hover over the status to see the raw output or error.

Click **Parent** or **Earlier** to open a **JJ Diff** tab for that exact commit.
The viewer uses [Pierre Diffs](https://diffs.com/) with syntax highlighting,
unified/split layouts, line wrapping, and a searchable changed-file list. Tabs
remain pinned to their commit and original directory, and can be reopened after
closing. Binary and metadata-only changes show a summary rather than text hunks.

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
│       ├── gui.tsx     JJ panel, /jj command, launcher, and bars
│       ├── panel.tsx   Full status output
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
