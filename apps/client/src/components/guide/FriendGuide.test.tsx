import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FriendGuideDialog, FriendGuidePage, GUIDE_STEPS } from "./FriendGuide";

test("the guide for friends covers install, Windows warning, firewall, same WLAN, QR code and power supply", () => {
  const html = renderToStaticMarkup(<FriendGuidePage />);
  for (const words of ["Weitere Informationen", "Trotzdem ausführen", "Firewall", "Private Netzwerke", "selben WLAN", "QR-Code", "Netzteil"]) assert.ok(html.includes(words), words);
  assert.deepEqual(GUIDE_STEPS.map(step => step.title), ["Installieren", "Firewall erlauben", "Handys ins selbe WLAN", "QR-Code scannen", "Laptop ans Netzteil"]);
  const dialog = renderToStaticMarkup(<FriendGuideDialog onClose={() => undefined} />);
  assert.match(dialog, /role="dialog" aria-modal="true" aria-labelledby="friend-guide-title"/);
  assert.match(dialog, /Schließen/);
});
