We are building an opencode plugin for opencode 2.0 that uses the experimental desktop api.

This plugin is for personal use and will jam lots of random functionality together in one plugin for easy config management.

The documentation for opencode plugins is here:
https://opencode.ai/v2/docs/build/plugins/

Here are the experimental gui docs:
https://opencode.ai/v2/docs/build/plugins/gui/

Here are the server docs:
https://opencode.ai/v2/docs/build/plugins/server/

## Icons in GUI components

Use the app's `@opencode/ui` icons through the GUI SDK's `ctx.ui.Icon`. Do not
import `@opencode/ui` directly: it is not a shared module available to plugin
bundles. Prefer the app's icon catalog over hand-written SVGs when a suitable
icon exists.

```tsx
import { usePlugin } from "@opencode/plugin/gui";

function DescribeAction() {
  const ctx = usePlugin();
  const ui = ctx.ui;

  return (
    <button type="button">
      <span aria-hidden="true">
        <ui.Icon name="edit" size="small" />
      </span>
      <span>Describe</span>
    </button>
  );
}
```

- In plugin `setup(ctx)`, use that context instead of calling `usePlugin()`.
- `name` must be an existing `IconName`. Check the installed SDK's
  `node_modules/@opencode/plugin/dist/gui/icon-name.d.ts`; do not guess names.
  Examples: `edit`, `circle-ban-sign`, `copy`, and `file-tree`.
- `size` accepts `"small"`, `"normal"`, or `"large"`. `class` is also supported.
- Icons beside visible labels are decorative: wrap them with `aria-hidden="true"`.
  For icon-only actions, use `ui.IconButton` with an accessible `label`, for example
  `<ui.IconButton icon="copy" label="Copy change ID" onClick={copy} />`.
- Keep window-only icon rendering inside GUI setup/components, not module scope
  or Electron main-process code.

See `src/features/jj/tree/context-menu.tsx` for a working example and the GUI
documentation's **App components** section for the SDK reference.

## notice!!!

This plugin will mostly be used on a really big git/jj repo thats accessed remotely

Running git / jj commands may take a while to complete. always keep in mind loading states. pre-loading. caching etc, to make sure that things feel good to use
