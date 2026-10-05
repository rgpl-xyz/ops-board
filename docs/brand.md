# Brand assets

Scope: which brand files OpsBoard ships, how its logo is composed and checked, and how the files change. How to run the check is in the [README](../README.md#testing-commands).

OpsBoard is part of RGPL, a family of products that share one visual identity, RGPL Mono Display v1.0. The brand files OpsBoard ships are copies generated from the RGPL sources, which live in a private RGPL repository. They are kept here as plain files, so OpsBoard builds and checks on its own.

## The sidebar logo

The sidebar shows the RGPL compact lockup: the approved `g` mark on its purple (Iris) square, followed by the product name `opsboard`. Application copy uses the display name `OpsBoard`; the lowercase `opsboard` appears only in the logo, and the logo's accessible name is `OpsBoard`.

The lockup is composed in the page, not shipped as artwork. Only the `g` mark is an image; the name is live text in OpsBoard's own font. No product-label typeface is approved yet, and artwork with the name as text would render in a different system font on each operating system. The product-label typeface is deferred by brand-owner decision, so no temporary font is selected or outlined; outlined lockup artwork is reconsidered once RGPL Mono Text or another explicitly approved and licensed companion typeface exists.

The composition's numbers in `apps/web/src/app/layout/shell-layout.component.scss` copy the RGPL brand specification v1.0 compact layout: a 40-unit canvas; the mark 32 units square at 4, 4; the name at x 46 with its baseline at 25.5, 14 units, weight 600, letter-spacing 0.02em; a right inset of 4, equal to the mark's left inset (a derived symmetry rule, not a separate metric). The canvas renders at the compact lockup's 32 px minimum, or at 2rem if that is larger (OpsBoard's root size is 15px, so 2rem alone would be 30 px). When the RGPL specification changes, update them together with the files below.

## Files

| File | Use |
| --- | --- |
| `apps/web/public/brand/g-compact-iris.svg` | The `g` mark in the sidebar logo |
| `apps/web/public/favicon.svg`, `favicon.ico` | Browser tab icons: the same `g` mark |
| `apps/web/public/apple-touch-icon.png`, `icons/icon-192.png`, `icons/icon-512.png` | Home-screen and installed-app icons, `purpose: "any"` |
| `apps/web/public/icons/icon-maskable-192.png`, `icons/icon-maskable-512.png` | Installed-app icons for launchers that crop to their own shape, `purpose: "maskable"`: the same mark, padded inside the maskable safe zone |
| `apps/web/public/icon-16.png`, `icon-32.png` | Not referenced by the page today; copied so the icon set stays complete for contexts that need PNGs |

Do not stretch, crop, recolour, outline, shadow or redraw any of these files. In forced-colours mode the sidebar keeps the logo's own colours on the brand's light ground (`--ob-brand-ground`) instead of letting the system recolour it.

The browser and installed-app colours (`theme-color` in `apps/web/src/index.html`, and `theme_color` and `background_color` in `apps/web/public/manifest.webmanifest`) equal the page background, `--ob-bg`. Change all four together.

## Colours and contrast

The brand's canonical light background is `#FDFDFF`, but it is not the only permissible light neutral. OpsBoard draws the logo on its page background, `--ob-bg` (`#f6f4ef`), in the brand's black ink (`--ob-brand-ink`), and keeps `#FDFDFF` (`--ob-brand-ground`) for the forced-colours ground. `npm run brand:verify` measures those pairings from `src/styles.scss` and the `g` mark itself:

- the name on the page background, at least 4.5:1 (19.1:1 today);
- the Iris mark against the page background, at least 3:1 (7.9:1);
- the name on the forced-colours ground, at least 4.5:1 (20.7:1).

## Verifying the copies

`apps/web/brand-assets.json` records the SHA-256 of every file in the table above. `npm run brand:verify` (in `apps/web`) fails when a listed file is missing or differs, when an unlisted file appears in `public/brand/` or `public/icons/` (since anything there ships), or when a contrast pairing above falls short. CI runs `npm run brand:verify` before the frontend build. It reads only this repository. `.gitattributes` stops Git from converting these files' line endings, so their hashes hold on every checkout.

To undo an accidental change to one of these files, restore it with `git restore`.

## Updating the copies

Only maintainers with access to the RGPL repository can produce new copies. Without that access, do not edit, re-export or optimise these files; open an issue describing the change instead.

1. In the RGPL repository, run `pnpm brand:assets` and its verification.
2. Copy the changed files into this repository. Source paths are relative to the RGPL repository's root:

   | RGPL source | OpsBoard destination |
   | --- | --- |
   | `libs/foundation/brand/assets/brand/g-compact-iris.svg` | `apps/web/public/brand/` |
   | `libs/foundation/brand/assets/root/icons/*` | `apps/web/public/icons/` |
   | the other files in `libs/foundation/brand/assets/root/` | `apps/web/public/` |

3. Set each copied file's hash in `apps/web/brand-assets.json` to the SHA-256 of the RGPL output it came from; `sha256sum` on the RGPL file and on the copy must print the same value. Add an entry for a new file and remove the entry for a deleted one.
4. If the RGPL specification's compact layout changed, update the numbers in `shell-layout.component.scss` to match.
5. Run `npm run brand:verify`, `npm test` and `npm run build`, then check the sidebar logo and the browser tab icon.
6. Commit the copied files and `apps/web/brand-assets.json` together.

## Licence and trademarks

The MIT License applies to the source code in this repository. The RGPL and OpsBoard names, logos, wordmarks and other brand assets, including the files in the table above, are not licensed for reuse under the MIT License and remain subject to applicable trademark and brand rights.
