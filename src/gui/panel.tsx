import { createSignal, Show } from "solid-js";
import { usePlugin, type MountedSession } from "@opencode/plugin/gui";
import { Hello } from "../rpc";
import type { definition } from "./definition";

// The side panel's content. Read props.session where you use it: the panel stays mounted across sessions.
export function PanelView(props: { readonly session: MountedSession }) {
  const ctx = usePlugin<typeof definition>();
  const ui = ctx.ui;
  const [output, setOutput] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);

  const greet = () =>
    ctx.toast.show({
      variant: "success",
      title: ctx.t("toast.hello", {
        greeting: ctx.stores.prefs.value.greeting,
      }),
    });

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    try {
      setOutput(await work());
    } catch (error) {
      ctx.toast.show({ variant: "error", title: String(error) });
    } finally {
      setBusy(false);
    }
  };

  // Calls the server part through its RPC. Read ctx.client where you call it: it changes when the server restarts.
  const askServer = () =>
    run(async () => {
      const result = (await ctx.client
        .rpc(Hello)
        .greet({ name: ctx.stores.prefs.value.greeting })) as { text: string };

      return result.text;
    });

  return (
    <div class="jello-panel">
      <h2>{ctx.t("panel.heading")}</h2>
      <p>{ctx.t("panel.body")}</p>
      <p>{ctx.t("panel.session", { directory: props.session.directory })}</p>
      <div class="jello-actions">
        <ui.Button variant="contrast" icon="check" onClick={greet}>
          {ctx.t("panel.greet")}
        </ui.Button>
        <ui.Button icon="server" busy={busy()} onClick={() => void askServer()}>
          {ctx.t("panel.server")}
        </ui.Button>
      </div>
      <Show when={output()}>{(text) => <ui.Markdown text={text()} />}</Show>
    </div>
  );
}
