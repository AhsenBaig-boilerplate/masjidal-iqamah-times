# Athan & Iqamah Timetable (Tailwind)

This is a static browser-based timetable app styled with Tailwind CSS. All table and UI styling uses Tailwind utility classes. Ready for easy migration to Next.js or other frameworks.

## Features
- Responsive, accessible timetable UI
- Light/dark mode support (via Tailwind)
- CSV upload and dynamic table rendering
- Modern, maintainable code structure

## Quick Start
1. Open `index.html` in your browser (Tailwind loaded via CDN)
2. All logic is in `/src/app.js` and related modules

## Migrating to Next.js
- Move `/src` contents to your Next.js `pages` or `app` directory
- Install Tailwind via npm and configure `tailwind.config.js`
- Replace CDN with `@tailwind` imports in your CSS

---

**For development, use the CDN. For production, use Tailwind CLI or PostCSS for optimal performance.**
