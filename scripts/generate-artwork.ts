import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type Artwork = "hero" | "social";

export const repository = "yannelli/callrail-sdk-typescript";
export const dimensions = {
  hero: { width: 1280, height: 520 },
  social: { width: 1280, height: 640 },
} as const;

const sans = `'Instrument Sans', Inter, 'Segoe UI', -apple-system, Helvetica, Arial, sans-serif`;
const rail = { x0: 72, x1: 1208, y: 340, node: 972 };

// A fixed formula keeps the rail path byte-identical between runs.
function railY(x: number): number {
  const envelope = 86 * Math.exp(-(((x - rail.node) / 118) ** 2));
  return rail.y + envelope * (0.75 * Math.sin(x / 13) + 0.25 * Math.sin(x / 7 + 1));
}

function railPath(): string {
  const points: string[] = [];
  for (let x = rail.x0; x <= rail.x1; x += 2) points.push(`${x} ${railY(x).toFixed(1)}`);
  return `M ${points.join(" L ")}`;
}

// Layout is designed on the 520 px hero frame; the social frame shifts it down.
export function artworkSvg(kind: Artwork): string {
  const { width, height } = dimensions[kind];
  const offset = kind === "social" ? 50 : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">CallRail SDK for TypeScript and Node.js</title>
  <desc id="description">${repository}. An unofficial CallRail API v3 client. A near-black canvas with the headline, two lines of description, a single white rail that becomes a call waveform, and a button naming the GitHub repository.</desc>
  <rect width="${width}" height="${height}" fill="#09090b"/>
  <g transform="translate(0 ${offset})" font-family="${sans}">
    <text x="68" y="142" font-size="88" font-weight="600" letter-spacing="-3.5" fill="#fafafa">CallRail for TypeScript</text>
    <text x="72" y="196" font-size="24" letter-spacing="-0.3" fill="#a1a1aa">Unofficial typed client for the CallRail API v3.</text>
    <text x="72" y="230" font-size="24" letter-spacing="-0.3" fill="#a1a1aa">Calls, trackers, and webhooks for Node.js.</text>
    <g aria-hidden="true">
      <path data-signal="true" d="${railPath()}" fill="none" stroke="#fafafa" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    </g>
    <rect x="72" y="414" width="428" height="52" rx="26" fill="#fafafa"/>
    <text x="286" y="447" text-anchor="middle" font-size="20" font-weight="500" letter-spacing="-0.2" fill="#09090b">github.com/${repository}</text>
  </g>
</svg>
`;
}

export function writeArtwork(directory: string): void {
  mkdirSync(directory, { recursive: true });
  for (const kind of ["hero", "social"] as const) {
    writeFileSync(join(directory, `${kind === "hero" ? "readme-hero" : "social-preview"}.svg`), artworkSvg(kind));
  }
}

export function renderSocialPng(directory: string, chromium = process.env.CHROMIUM ?? "chromium"): void {
  const temporary = mkdtempSync(join(tmpdir(), "callrail-artwork-"));
  try {
    const screenshot = join(temporary, "social-preview.png");
    execFileSync(chromium, [
      "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
      "--force-device-scale-factor=1", "--default-background-color=09090b",
      `--user-data-dir=${join(temporary, "profile")}`,
      "--window-size=1280,640", `--screenshot=${screenshot}`,
      pathToFileURL(resolve(directory, "social-preview.svg")).href,
    ], { stdio: "pipe", timeout: 30_000 });
    const png = readFileSync(screenshot);
    if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || png.readUInt32BE(16) !== 1280 || png.readUInt32BE(20) !== 640) {
      throw new Error("Chromium did not produce a 1280 × 640 PNG.");
    }
    writeFileSync(join(directory, "social-preview.png"), png);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function main(args = process.argv.slice(2)): void {
  if (args.some((argument) => argument !== "--png")) throw new Error("Usage: npm run artwork -- [--png]");
  const directory = resolve("assets");
  writeArtwork(directory);
  if (args.includes("--png")) renderSocialPng(directory);
  console.log(`Generated SVG artwork in ${directory}${args.includes("--png") ? " and social-preview.png" : ""}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
