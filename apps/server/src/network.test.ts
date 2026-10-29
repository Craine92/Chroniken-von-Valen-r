import assert from "node:assert/strict";
import test from "node:test";
import type { NetworkInterfaceInfo } from "node:os";
import { createControllerUrl, describeAddressChoice, findLocalAddress, rankLocalAddresses, resolvePublicHost } from "./network";

const v4 = (address: string, mac = "70:1a:b8:f1:05:ea", internal = false): NetworkInterfaceInfo =>
  ({ address, netmask: "255.255.255.0", family: "IPv4", mac, internal, cidr: `${address}/24` });
const v6 = (address: string): NetworkInterfaceInfo =>
  ({ address, netmask: "ffff:ffff:ffff:ffff::", family: "IPv6", mac: "70:1a:b8:f1:05:ea", internal: false, cidr: `${address}/64`, scopeid: 0 });
const LOOPBACK = { "Loopback Pseudo-Interface 1": [v4("127.0.0.1", "00:00:00:00:00:00", true)] };

test("Windows with VirtualBox host-only adapter named 'Ethernet 2' and WLAN picks the WLAN address", () => {
  // So meldet Node den PC aus dem Fehlerbericht: Der VirtualBox-Adapter trägt keinen sprechenden Namen.
  const interfaces = { "Ethernet 2": [v4("192.168.56.1", "0a:00:27:00:00:2d")], WLAN: [v6("fe80::1"), v4("192.168.178.29")], ...LOOPBACK };
  assert.equal(findLocalAddress(interfaces), "192.168.178.29");
  assert.deepEqual(rankLocalAddresses(interfaces).map(c => [c.address, c.ignoredBecause ?? "ok"]), [["192.168.178.29", "ok"], ["192.168.56.1", "VirtualBox-Adapter"]]);
  assert.equal(createControllerUrl("VAL-1234", {}, interfaces), "http://192.168.178.29:5173/controller?room=VAL-1234");
  assert.deepEqual(describeAddressChoice({}, interfaces), [
    "QR-Code-Adresse: 192.168.178.29 (WLAN)",
    "  übergangen: 192.168.56.1  Ethernet 2 (VirtualBox-Adapter)"
  ]);
});

test("virtual adapters are recognised by name: VirtualBox, VMware, vEthernet, Hyper-V, WSL, Docker, Bluetooth and VPNs", () => {
  const interfaces = {
    "VirtualBox Host-Only Network": [v4("192.168.56.1", "aa:bb:cc:00:00:01")],
    "VMware Network Adapter VMnet8": [v4("192.168.200.1", "aa:bb:cc:00:00:02")],
    "vEthernet (WSL)": [v4("172.27.48.1", "aa:bb:cc:00:00:03")],
    "vEthernet (Default Switch)": [v4("172.22.96.1", "aa:bb:cc:00:00:04")],
    "Docker Desktop": [v4("10.0.75.1", "aa:bb:cc:00:00:05")],
    "Bluetooth-Netzwerkverbindung": [v4("192.168.44.1", "aa:bb:cc:00:00:06")],
    Tailscale: [v4("100.101.102.103", "aa:bb:cc:00:00:07")],
    "ProtonVPN TUN": [v4("10.2.0.2", "aa:bb:cc:00:00:08")],
    "OpenVPN TAP-Windows6": [v4("10.8.0.6", "aa:bb:cc:00:00:09")],
    NordLynx: [v4("10.5.0.2", "aa:bb:cc:00:00:0a")],
    Ethernet: [v4("192.168.1.42", "3c:52:82:00:00:01")],
    ...LOOPBACK
  };
  const ranked = rankLocalAddresses(interfaces);
  assert.equal(findLocalAddress(interfaces), "192.168.1.42");
  assert.deepEqual(ranked.filter(c => !c.ignoredBecause).map(c => c.name), ["Ethernet"]);
  assert.deepEqual(Object.fromEntries(ranked.filter(c => c.ignoredBecause).map(c => [c.name, c.ignoredBecause])), {
    "VirtualBox Host-Only Network": "VirtualBox-Adapter", "VMware Network Adapter VMnet8": "VMware-Adapter",
    "vEthernet (WSL)": "Hyper-V-Adapter", "vEthernet (Default Switch)": "Hyper-V-Adapter", "Docker Desktop": "Docker-Adapter",
    "Bluetooth-Netzwerkverbindung": "Bluetooth-Adapter", Tailscale: "VPN-Adapter", "ProtonVPN TUN": "VPN-Adapter",
    "OpenVPN TAP-Windows6": "VPN-Adapter", NordLynx: "VPN-Adapter"
  });
});

test("virtual adapters with neutral names are recognised by their vendor MAC prefix", () => {
  for (const [mac, reason] of [["0a:00:27:00:00:11", "VirtualBox-Adapter"], ["08:00:27:12:34:56", "VirtualBox-Adapter"], ["00:50:56:c0:00:08", "VMware-Adapter"], ["00:15:5d:01:02:03", "Hyper-V-Adapter"], ["02:42:ac:11:00:02", "Docker-Adapter"]]) {
    const ranked = rankLocalAddresses({ "Ethernet 3": [v4("192.168.99.1", mac)], "Wi-Fi": [v4("10.0.0.23")] });
    assert.equal(ranked[0]!.address, "10.0.0.23", mac);
    assert.equal(ranked[1]!.ignoredBecause, reason, mac);
  }
});

test("macOS and Linux names: en0, wlp2s0 and eth0 win over bridges, tunnels and Docker", () => {
  assert.equal(findLocalAddress({ bridge100: [v4("192.168.64.1", "aa:bb:cc:00:00:01")], utun3: [v4("10.64.0.1", "aa:bb:cc:00:00:02")], en0: [v4("192.168.0.17")] }), "192.168.0.17");
  assert.equal(findLocalAddress({ docker0: [v4("172.17.0.1", "aa:bb:cc:00:00:03")], "br-1a2b3c": [v4("172.18.0.1", "aa:bb:cc:00:00:04")], veth9f1: [v4("172.19.0.1", "aa:bb:cc:00:00:05")], wlp2s0: [v4("192.168.2.50")] }), "192.168.2.50");
  assert.equal(findLocalAddress({ wg0: [v4("10.6.0.2", "aa:bb:cc:00:00:06")], eth0: [v4("10.1.1.5")] }), "10.1.1.5");
});

test("link-local addresses are never chosen while a real network exists", () => {
  const interfaces = { Ethernet: [v4("169.254.12.7", "3c:52:82:00:00:01")], WLAN: [v4("192.168.178.29")] };
  assert.equal(findLocalAddress(interfaces), "192.168.178.29");
  assert.equal(rankLocalAddresses(interfaces)[1]!.ignoredBecause, "Link-Local-Adresse ohne Netzwerk");
});

test("real adapters are preferred over unknown ones, private addresses over public ones", () => {
  assert.equal(findLocalAddress({ "Unbekannter Adapter": [v4("192.168.7.7", "3c:52:82:00:00:09")], Ethernet: [v4("192.168.1.42")] }), "192.168.1.42");
  assert.equal(findLocalAddress({ Ethernet: [v4("85.12.1.4")], WLAN: [v4("192.168.178.29")] }), "192.168.178.29");
});

test("with several real networks all candidates are logged and the chosen one is marked", () => {
  const interfaces = { Ethernet: [v4("192.168.1.42", "3c:52:82:00:00:01")], WLAN: [v4("192.168.178.29")], "Ethernet 2": [v4("192.168.56.1", "0a:00:27:00:00:2d")] };
  assert.deepEqual(describeAddressChoice({}, interfaces), [
    "QR-Code-Adresse: 192.168.1.42 (Ethernet)",
    "Mehrere Netzwerke gefunden, gewählt ist die erste. Mit PUBLIC_HOST=<Adresse> lässt sich eine andere festlegen:",
    "  → 192.168.1.42  Ethernet",
    "    192.168.178.29  WLAN",
    "  übergangen: 192.168.56.1  Ethernet 2 (VirtualBox-Adapter)"
  ]);
});

test("a single real network without ignored adapters keeps the log quiet", () => {
  assert.deepEqual(describeAddressChoice({}, { WLAN: [v4("192.168.178.29")], ...LOOPBACK }), []);
});

test("only virtual adapters fall back to the best of them with a warning, no network falls back to localhost", () => {
  const onlyVirtual = { "vEthernet (WSL)": [v4("172.27.48.1", "aa:bb:cc:00:00:03")] };
  assert.equal(findLocalAddress(onlyVirtual), "172.27.48.1");
  assert.match(describeAddressChoice({}, onlyVirtual).join("\n"), /Nur virtuelle Adapter gefunden/);
  assert.equal(findLocalAddress({ ...LOOPBACK }), "localhost");
  assert.equal(findLocalAddress({}), "localhost");
});

test("PUBLIC_HOST still overrides the automatic choice", () => {
  const interfaces = { "Ethernet 2": [v4("192.168.56.1", "0a:00:27:00:00:2d")], WLAN: [v4("192.168.178.29")] };
  assert.equal(resolvePublicHost({ PUBLIC_HOST: " 192.168.178.50 " }, interfaces), "192.168.178.50");
  assert.equal(createControllerUrl("VAL-1", { PUBLIC_HOST: "spiel.local", NODE_ENV: "production", PORT: "3001" }, interfaces), "http://spiel.local:3001/controller?room=VAL-1");
  assert.deepEqual(describeAddressChoice({ PUBLIC_HOST: "spiel.local" }, interfaces), ["QR-Code-Adresse: spiel.local (PUBLIC_HOST gesetzt, automatische Auswahl übersprungen)"]);
  assert.equal(resolvePublicHost({ PUBLIC_HOST: "  " }, interfaces), "192.168.178.29", "an empty override is ignored");
});

test("listen errors become friendly German hints instead of a crash", async () => {
  const { describeListenError } = await import("./network");
  assert.match(describeListenError(Object.assign(new Error("x"), { code: "EADDRINUSE" }), 3001), /Port 3001 ist schon belegt/);
  assert.match(describeListenError(Object.assign(new Error("x"), { code: "EACCES" }), 3001), /neu starten/);
  assert.match(describeListenError(new Error("kaputt"), 3001), /kaputt/);
});
