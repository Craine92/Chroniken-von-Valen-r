import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

type InterfaceMap = NodeJS.Dict<NetworkInterfaceInfo[]>;
type Env = Record<string, string | undefined>;

export interface AddressCandidate {
  name: string;
  address: string;
  /** Warum die Adresse übergangen wird; leer bei echten WLAN-/Ethernet-Kandidaten. */
  ignoredBecause?: string;
  physical: boolean;
}

/**
 * Virtuelle Adapter erkennt man unter Windows oft nicht am Namen: Der VirtualBox-Host-Only-Adapter heißt dort
 * schlicht „Ethernet 2“. Deshalb zählen Name, MAC-Präfix des Herstellers und Link-Local-Adressen.
 */
const VIRTUAL_NAMES: readonly [RegExp, string][] = [
  [/virtualbox|vbox/i, "VirtualBox-Adapter"],
  [/vmware|vmnet/i, "VMware-Adapter"],
  [/vethernet|hyper-?v|default switch/i, "Hyper-V-Adapter"],
  [/\bwsl\b/i, "WSL-Adapter"],
  [/docker|^br-|^veth/i, "Docker-Adapter"],
  [/loopback|^lo\d*$/i, "Loopback"],
  [/bluetooth|bnep/i, "Bluetooth-Adapter"],
  [/vpn|tailscale|zerotier|^zt|wireguard|^wg\d|nordlynx|openvpn|tap-windows|^tun\d|^tap\d|^utun|^ppp\d|anyconnect|cisco|fortinet|forticlient|globalprotect|pangp|hamachi|radmin|mullvad|proton/i, "VPN-Adapter"],
  [/^bridge\d|^awdl|^llw|^anpi|^ap\d/i, "macOS-Systemadapter"]
];
const VIRTUAL_MAC_PREFIXES: readonly [string, string][] = [
  ["0a:00:27", "VirtualBox-Adapter"], ["08:00:27", "VirtualBox-Adapter"],
  ["00:05:69", "VMware-Adapter"], ["00:0c:29", "VMware-Adapter"], ["00:1c:14", "VMware-Adapter"], ["00:50:56", "VMware-Adapter"],
  ["00:15:5d", "Hyper-V-Adapter"], ["02:42:", "Docker-Adapter"], ["00:1c:42", "Parallels-Adapter"]
];
/** Typische Namen echter Netzwerkkarten unter Windows, macOS und Linux. */
const PHYSICAL_NAME = /^(wlan|wi-?fi|wireless|drahtlos|ethernet|lan-verbindung|local area connection|eth\d|en\d|enp|eno|ens|enx|wlp|wlo|wlx|wlan\d)/i;

function isPrivateAddress(address: string): boolean {
  return address.startsWith("10.") || address.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}

function ignoreReason(name: string, entry: NetworkInterfaceInfo): string | undefined {
  const byName = VIRTUAL_NAMES.find(([pattern]) => pattern.test(name));
  if (byName) return byName[1];
  const mac = entry.mac.toLowerCase();
  const byMac = VIRTUAL_MAC_PREFIXES.find(([prefix]) => mac.startsWith(prefix));
  if (byMac) return byMac[1];
  if (entry.address.startsWith("169.254.")) return "Link-Local-Adresse ohne Netzwerk";
  return undefined;
}

/** Alle IPv4-Adressen, die besten zuerst: echte WLAN-/Ethernet-Adapter mit privater Adresse vorne, virtuelle Adapter markiert. */
export function rankLocalAddresses(interfaces: InterfaceMap = networkInterfaces()): AddressCandidate[] {
  const candidates = Object.entries(interfaces).flatMap(([name, entries]) => (entries ?? [])
    .filter(entry => entry.family === "IPv4" && !entry.internal)
    .map((entry): AddressCandidate => {
      const reason = ignoreReason(name, entry);
      return { name, address: entry.address, physical: PHYSICAL_NAME.test(name), ...(reason ? { ignoredBecause: reason } : {}) };
    }));
  const rank = (candidate: AddressCandidate) => (candidate.ignoredBecause ? 4 : 0) + (isPrivateAddress(candidate.address) ? 0 : 2) + (candidate.physical ? 0 : 1);
  // Array.prototype.sort ist stabil: Bei gleichem Rang bleibt die Reihenfolge des Betriebssystems erhalten.
  return candidates.sort((a, b) => rank(a) - rank(b));
}

/** Die Adresse, unter der Handys den Laptop im selben WLAN erreichen; ohne Netzwerk „localhost“. */
export function findLocalAddress(interfaces: InterfaceMap = networkInterfaces()): string {
  return rankLocalAddresses(interfaces)[0]?.address ?? "localhost";
}

/** PUBLIC_HOST übersteuert die automatische Auswahl, z. B. wenn mehrere echte Netze aktiv sind. */
export function resolvePublicHost(env: Env = process.env, interfaces: InterfaceMap = networkInterfaces()): string {
  return env.PUBLIC_HOST?.trim() || findLocalAddress(interfaces);
}

/**
 * Log-Zeilen zur Adresswahl. Sie erscheinen, sobald mehr als ein echter Kandidat übrig bleibt oder ein Adapter
 * übergangen wurde, damit sichtbar ist, welche Adresse im QR-Code landet und warum.
 */
export function describeAddressChoice(env: Env = process.env, interfaces: InterfaceMap = networkInterfaces()): string[] {
  const candidates = rankLocalAddresses(interfaces);
  const usable = candidates.filter(candidate => !candidate.ignoredBecause);
  const ignored = candidates.filter(candidate => candidate.ignoredBecause);
  const override = env.PUBLIC_HOST?.trim();
  if (override) return [`QR-Code-Adresse: ${override} (PUBLIC_HOST gesetzt, automatische Auswahl übersprungen)`];
  if (usable.length <= 1 && ignored.length === 0) return [];
  const chosen = candidates[0];
  const lines = [`QR-Code-Adresse: ${chosen ? `${chosen.address} (${chosen.name})` : "localhost (kein Netzwerk gefunden)"}`];
  if (usable.length > 1) {
    lines.push(`Mehrere Netzwerke gefunden, gewählt ist die erste. Mit PUBLIC_HOST=<Adresse> lässt sich eine andere festlegen:`);
    usable.forEach(candidate => lines.push(`  ${candidate === chosen ? "→" : " "} ${candidate.address}  ${candidate.name}`));
  }
  if (chosen?.ignoredBecause) lines.push(`Achtung: Nur virtuelle Adapter gefunden; Handys erreichen diese Adresse vermutlich nicht.`);
  ignored.forEach(candidate => lines.push(`  übergangen: ${candidate.address}  ${candidate.name} (${candidate.ignoredBecause})`));
  return lines;
}

export function createControllerUrl(roomCode: string, env: Env = process.env, interfaces: InterfaceMap = networkInterfaces()): string {
  const protocol = env.PUBLIC_PROTOCOL ?? "http";
  const host = resolvePublicHost(env, interfaces);
  const port = env.PUBLIC_CLIENT_PORT ?? (env.NODE_ENV === "production" ? env.PORT ?? "3001" : "5173");
  return `${protocol}://${host}:${port}/controller?room=${encodeURIComponent(roomCode)}`;
}
