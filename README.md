# vanity

Personal portfolio site. Pure HTML, CSS, and vanilla JavaScript.

## Development

Use a local server so `projects.json` can be fetched at runtime:
```bash
npx serve .
```

You can still open `index.html` directly for quick layout inspection, but the
projects grid will show its fallback message because browsers block `fetch`
from `file://`.

## Structure

```
index.html    # Single-page structure and theme picker
styles.css    # Semantic tokens plus Editorial / Contractor / Lattice themes
script.js     # Theme resolution, theme-copy rendering, lattice, scroll effects
projects.json # Project data rendered into the grid at runtime
themes.json   # Theme-owned copy for hero, positioning, and contact
```

## Theme System

The site ships three curated themes:

- `editorial`
- `contractor`
- `lattice`

Theme selection resolves in this order:

1. `?theme=<name>` query param
2. saved `localStorage` preference
3. default theme from `themes.json`

Each theme changes both design tokens and copy. `script.js` reads `themes.json`
at runtime, applies the matching copy, and keeps the lattice canvas in sync by
reading CSS custom properties after every theme switch.

## Deploy

Push to main. Vercel/Netlify/GitHub Pages will serve static files automatically.
