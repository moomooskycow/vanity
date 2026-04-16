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
index.html    # Single-page structure
styles.css    # All styles with CSS custom properties
script.js     # Theme toggle, lattice, scroll effects, project rendering
projects.json # Project data rendered into the grid at runtime
```

## Deploy

Push to main. Vercel/Netlify/GitHub Pages will serve static files automatically.
