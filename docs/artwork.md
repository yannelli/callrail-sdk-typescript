# Repository artwork

The README hero and GitHub social preview use a near-black canvas with white type. The headline and two lines of description sit at the top. One white rail runs the full width below them and rises into a call waveform on the right. A white button at the bottom names the GitHub repository, `github.com/yannelli/callrail-sdk-typescript`.

## Files

- [README hero](../assets/readme-hero.svg), 1280 × 520 SVG.
- [Social preview source](../assets/social-preview.svg), 1280 × 640 SVG.
- [Social preview upload](../assets/social-preview.png), 1280 × 640 PNG.

The SVG files contain their own colors, text, and paths. They load no scripts, images, or external fonts. The README keeps its text heading and uses descriptive alt text for the hero.

## Generate the images

From the repository root, run these commands with Node.js 20 or later.

```bash
npm ci
npm run artwork
```

The generator writes both SVG files to `assets/`. Edit `scripts/generate-artwork.ts` to change their content or layout.

To export the PNG, install Chromium through your operating system. Then run this command.

```bash
npm run artwork -- --png
```

The export uses the `chromium` executable by default. Set `CHROMIUM` to the path of your Chrome or Chromium executable if needed. For example, on Linux, run this command.

```bash
CHROMIUM=/usr/bin/google-chrome npm run artwork -- --png
```

The SVG files prefer Instrument Sans and fall back to the system sans-serif font. Font metrics can differ between systems. Review the export after any design or font change.

The renderer uses headless Chromium with its sandbox disabled. Run it only on these repository-generated SVG files. The command exits with an error if Chromium fails or produces the wrong image dimensions.

## Upload the GitHub social preview

1. Open the repository on GitHub.
2. Select **Settings**.
3. In **General**, find **Social preview**.
4. Select **Edit**, then **Upload an image**.
5. Upload `assets/social-preview.png`.

GitHub uses this image when someone shares a repository link. The PNG is ready for upload. This repository change does not update the GitHub setting.
