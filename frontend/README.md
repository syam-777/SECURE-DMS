# SECURE-DMS — Secure Document Management System

Frontend client for SECURE-DMS. Built with Vite and React.

## Branding

- Browser tab / window title: `SECURE-DMS` (set in `index.html`)
- Favicon: `public/favicon.svg` (primary), `public/favicon.png` (512px),
  `public/apple-touch-icon.png` (180px) — shield + document + lock mark in
  `#0f172a` / `#2563eb` / white

Any file placed in `public/` is served from the site root, so the favicon is
referenced as `/favicon.svg`, `/favicon.png` and `/apple-touch-icon.png`.

## Development

```sh
npm install
npm run dev     # start dev server
npm run build   # production build into dist/
npm run lint    # eslint
npm run preview # preview the production build
```
