# Design assets

Everything visual lives in three places:

| Path                          | What it is                                                        |
| ----------------------------- | ----------------------------------------------------------------- |
| `docs/design/design-system.md`| The design system: color tokens (with computed contrast ratios), typography, spacing, focus, motion, component and voice rules |
| `assets/design/icon.svg`      | Hand-written master icon (source of truth for the mark)           |
| `assets/design/icon-16.svg`   | Simplified variant rendered only at 16 px                         |
| `assets/design/icon-512.png`  | Large raster for future store listing assets                      |
| `public/icon/{16,32,48,96,128}.png` | Extension icons; WXT wires these into the manifest automatically |

## Regenerating the PNGs

The PNGs are generated from the SVGs — edit the SVGs, never the PNGs — then:

```sh
pnpm icons
```

(`scripts/generate-icons.mjs`, using the `sharp` devDependency.) Commit the
regenerated PNGs; stores and the manifest need them in-tree. After a shape
change, eyeball the 16 px output at 10× before committing — detail that
survives 128 px often dies at 16.

## Checking contrast

If you change a color token, recompute its pairings and update the table in
`design-system.md`:

```sh
node -e "const l=h=>{const n=parseInt(h.slice(1),16),f=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4};return .2126*f(n>>16)+.7152*f(n>>8&255)+.0722*f(n&255)},r=(a,b)=>{const[x,y]=[l(a),l(b)].sort((p,q)=>q-p);console.log(((x+.05)/(y+.05)).toFixed(2))};r(process.argv[1],process.argv[2])" "#17252b" "#ffffff"
```

Targets: 4.5:1 minimum for text (AA), 7:1 for body text (AAA), 3:1 for
non-text UI and focus indicators.
