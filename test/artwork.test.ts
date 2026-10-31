import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { artworkSvg, dimensions, main, repository, writeArtwork } from "../scripts/generate-artwork.js";

for (const kind of ["hero", "social"] as const) {
  test(`${kind} artwork is deterministic, self-contained, and identifies the repository`, () => {
    const svg = artworkSvg(kind);
    const { width, height } = dimensions[kind];
    assert.equal(svg, artworkSvg(kind));
    assert.ok(svg.includes(`viewBox="0 0 ${width} ${height}"`));
    assert.ok(svg.includes(`<text x="64" y="${height - 34}" font-size="${kind === "social" ? 30 : 42}">${repository}</text>`));
    assert.match(svg, /<title id="title">CallRail SDK for TypeScript and Node.js<\/title>/);
    assert.match(svg, /aria-labelledby="title description"/);
    assert.doesNotMatch(svg, /<script|<foreignObject|<image|href=|url\(/);
  });
}

test("writeArtwork reproduces the checked-in SVG assets", () => {
  const directory = mkdtempSync(join(tmpdir(), "callrail-artwork-test-"));
  try {
    writeArtwork(directory);
    for (const name of ["readme-hero.svg", "social-preview.svg"]) {
      assert.equal(readFileSync(join(directory, name), "utf8"), readFileSync(join("assets", name), "utf8"));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the social export has the GitHub preview dimensions", () => {
  const png = readFileSync("assets/social-preview.png");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 1280);
  assert.equal(png.readUInt32BE(20), 640);
  assert.ok(png.length < 1_000_000, "GitHub social preview is smaller than 1 MB");
});

test("the artwork command rejects unknown options", () => {
  assert.throws(() => main(["--unknown"]), /Usage:/);
});
