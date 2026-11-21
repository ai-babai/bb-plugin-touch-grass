// Browser entry of the harness: a minimal BB chat column that loads the real plugin
// entry points (app.tsx front, server.ts RPC) against the fake host runtime.
import { host } from "./install";
import { createRoot } from "react-dom/client";
import app from "../../app";
import activate, { contract } from "../../server";

type Banner = { id: string; chrome: string; component: () => React.ReactNode };
type Customization = { id: string; scopes: string[]; banners: Banner[] };

const customizations: Customization[] = [];
const definition = app as unknown as { __bbPluginApp: boolean; setup(api: unknown): void };
definition.setup({ composer: { customize: (c: Customization) => customizations.push(c) } });
activate(host.serverApi as never);

const banners = customizations.flatMap(c => c.banners);
function Chat() {
  return (
    <>
      {banners.map(({ id, component: Component }) => (
        <div key={id} data-bb-plugin="touch-grass" data-banner={id}><Component /></div>
      ))}
    </>
  );
}
createRoot(document.getElementById("banner")!).render(<Chat />);

Object.assign(window, {
  bb: { ...host, registered: { customizations: JSON.parse(JSON.stringify(customizations)), rpc: Object.keys(contract) } },
});
