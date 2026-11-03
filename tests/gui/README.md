# File-view browser smoke test

Run `bun run test:gui`, then open <http://127.0.0.1:5180>.

The page uses the production file-view components with mock language responses
and small host UI stubs. It makes no repository changes or actual LSP queries.
Real language-service behavior is tested in `src/features/intelligence/server.test.ts`.

Check:

0. Click **Open peek modal**: the native dialog fills the window with 32px margins
   on every side (16px on small screens). Background content is inert and Tab stays
   inside. Source right-click menus remain interactive in the modal. Escape closes
   an open menu, otherwise goes back one navigation step; at the root it dismisses
   hover/selection, then the modal. Backdrop/close-button dismissal
   restores focus to the opening button. Dragging from inside to the backdrop must
   not accidentally dismiss it.

1. The main file contains 2,002 lines. Scroll to `item1999`; only a viewport-sized
   set of `[data-line]` nodes should exist inside the renderer's shadow root.
2. Click `value`: occurrences are outlined and query actions become enabled.
   Clicking an occurrence again clears selection.
3. Definition opens the complete `definition.ts`; Back returns to the cached
   main file and its references. Forward restores the destination.
4. F12, Shift+F12, modifier-click, and right-click target the **viewed** file.
   The menu also offers type definition, implementations and hover information.
5. Hover's `<script>` text remains literal text, never a DOM script element.
   Hold Escape to repeat back through navigation history; repeats at the root must
   keep the modal open until Escape is released and pressed again.
   With navigation history, Escape goes back one step even when hover or selection
   is present. At the root it dismisses hover before clearing the symbol selection.
6. Wrap does not reload the document. Refresh reloads it without jumping back
   to the original destination line. Arrow/Page keys, j/k and Ctrl+D/U scroll
   source rather than the parent diff.
7. Menus focus the first enabled item, support arrows/Home/End, and restore focus
   on Escape. Confirm no uncaught errors in the browser console.

`window.fileViewTest.model` and `window.fileViewTest.calls` are exposed for browser
automation. The production bundle neither imports this harness nor its SDK stub.

Run `await window.fileViewTest.modalEscapeRegression()` in the browser console to
check the complete modal path: navigation with header or source focus, followed by
both Escape keydown and native dialog `cancel`. Each must go back exactly once
without closing the modal. This catches behavior that model-only tests cannot.

The mock gutter provider supplies solid blue on line 1, outlined green on line 2,
a solid red deletion anchor on line 3, and outlined blue on line 1001. Scroll to
line 1001 and back to check that virtualized gutter signs survive recycling.

Cmd/Ctrl-click **Cmd-click main.ts** to test the real JJ filename-launch model.
It should open a modal titled **File: main.ts · working copy**, load the whole
file without a symbol lookup, hide Refresh query, and retain gutter signs and
Escape navigation. A plain click must not open it. In the app, check both tree
rows and section filenames in single-file and stacked diff modes; ordinary tree
selection and stacked-header path copying should remain unchanged.
