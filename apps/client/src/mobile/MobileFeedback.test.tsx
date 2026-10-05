import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AudioSettingsPanel } from "../audio/AudioSettings";
import { MobileFeedbackToast } from "./MobileFeedback";

test("trade toast provides a visible accessible action; ordinary status has only dismissal", () => {
  const feedback = { id: "trade", type: "tradeOffer" as const, title: "HANDELSANGEBOT", message: "Tharok möchte mit dir handeln.",
    actionLabel: "HANDEL ANSEHEN", action: () => undefined };
  const html = renderToStaticMarkup(<MobileFeedbackToast snapshot={{ current: feedback, exiting: false }} onDismiss={() => undefined} onHeightChange={() => undefined} />);
  assert.match(html, /aria-live="assertive"/); assert.match(html, /HANDEL ANSEHEN/); assert.match(html, /Tharok möchte mit dir handeln/);
  const normal = renderToStaticMarkup(<MobileFeedbackToast snapshot={{ current: { id: "turn", type: "turn", title: "DU BIST AM ZUG", message: "Dein Abenteuer geht weiter." }, exiting: true }} onDismiss={() => undefined} onHeightChange={() => undefined} />);
  assert.match(normal, /is-exiting/); assert.match(normal, /aria-live="polite"/); assert.equal((normal.match(/<button/g) ?? []).length, 1);
  assert.equal(renderToStaticMarkup(<MobileFeedbackToast snapshot={{ exiting: false }} onDismiss={() => undefined} onHeightChange={() => undefined} />), "");
});

test("closed primary and controller settings preserve the existing floating trigger", () => {
  const primary = renderToStaticMarkup(<AudioSettingsPanel />);
  const controller = renderToStaticMarkup(<AudioSettingsPanel role="controller" />);
  assert.equal(controller, primary);
});
