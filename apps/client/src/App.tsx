import { lazy, Suspense } from "react";
import { ControllerPage } from "./pages/ControllerPage";
import { HostPage } from "./pages/HostPage";
import { AudioRuntime } from "./audio/AudioSettings";

const VisualQaPage = import.meta.env.DEV
  ? lazy(() => import("./pages/VisualQaPage").then((module) => ({ default: module.VisualQaPage })))
  : undefined;

export function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/controller") return <><AudioRuntime role="controller" /><ControllerPage /></>;
  if (path === "/visual-qa" && VisualQaPage) return <Suspense fallback={null}><VisualQaPage /></Suspense>;
  if (path === "/host" || path === "/") return <><AudioRuntime role="primary" /><HostPage /></>;

  return (
    <main className="not-found">
      <p className="eyebrow">Valenør</p>
      <h1>Dieser Pfad verliert sich im Nebel.</h1>
      <a className="primary-button" href="/host">Zur Lobby</a>
    </main>
  );
}
