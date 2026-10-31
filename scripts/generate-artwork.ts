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

// CallRail resources converge on one typed client, like routes on a switchboard.
export function artworkSvg(kind: Artwork): string {
  const { width, height } = dimensions[kind];
  const social = kind === "social";
  const offset = social ? 52 : 0;
  const footer = height - 88;
  const ground = "#ecebe7";
  const ink = "#38450f";
  const route = "#c4d496";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">CallRail SDK for TypeScript and Node.js</title>
  <desc id="description">${repository}. An unofficial CallRail API v3 client. Calls, texts, and webhooks connect to TypeScript.</desc>
  <rect width="${width}" height="${height}" fill="${ground}"/>
  <rect x="850" width="430" height="${height}" fill="${ink}"/>
  <g font-family="Arial, Helvetica, sans-serif" fill="${ink}">
    <text x="64" y="${158 + offset}" font-size="128" font-weight="700" letter-spacing="-6">CallRail</text>
    <text x="64" y="${250 + offset}" font-size="82" font-weight="700" letter-spacing="-3">TypeScript SDK</text>
    <text x="68" y="${314 + offset}" font-size="30">CallRail API v3 · Node.js</text>
    <text x="68" y="${375 + offset}" font-family="monospace" font-size="27">npm install callrail</text>
  </g>
  <g transform="translate(0 ${offset})">
    <g fill="none" stroke="${route}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 902 144 H 990 Q 1036 144 1036 190 V 208 Q 1036 254 1082 254 H 1174"/>
      <path d="M 902 254 H 1174"/>
      <path d="M 902 364 H 990 Q 1036 364 1036 318 V 300 Q 1036 254 1082 254"/>
    </g>
    <g fill="${ground}" font-family="Arial, Helvetica, sans-serif" font-size="26">
      <text x="898" y="113">Calls</text>
      <text x="898" y="223">Texts</text>
      <text x="898" y="${social ? 421 : 410}">Webhooks</text>
    </g>
    <rect x="1118" y="220" width="100" height="68" fill="${ground}"/>
    <text x="1168" y="265" fill="${ink}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700">TS</text>
  </g>
  <rect y="${footer}" width="${width}" height="88" fill="${ink}"/>
  <g fill="${ground}" font-family="Arial, Helvetica, sans-serif">
    <text x="64" y="${footer + 54}" font-size="${social ? 30 : 42}">${repository}</text>
    <text x="1216" y="${footer + 54}" font-size="24" text-anchor="end">Unofficial SDK</text>
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
      "--force-device-scale-factor=1", "--default-background-color=ecebe7",
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
