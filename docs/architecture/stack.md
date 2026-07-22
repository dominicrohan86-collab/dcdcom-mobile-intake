# Stack Decision

## Selected Packages

### UI

- **React + Vite** replace manual `innerHTML` rendering and global event rebinding.
- **TanStack Query** owns API cache, loading states, invalidation, and mutation state.
- **Radix UI** provides accessible dialog, tabs, select, checkbox, avatar, and progress primitives. The local `components/ui.jsx` layer follows the shadcn composition model without retaining a bespoke widget implementation.
- **Tailwind CSS + CVA + clsx + tailwind-merge** replace the monolithic hand-authored stylesheet and centralize variants.
- **React Hook Form + Zod resolver** replace manual form reads and validation.
- **Lucide React** replaces custom SVG icon strings.
- **Ky** replaces repeated raw `fetch` wrappers.

### Backend

- **Hono** replaces the manual pathname/method condition tree and provides Worker-native routing and middleware.
- **Zod + @hono/zod-validator** replace custom JSON parsing, enum checking, and string validation.
- **Hono secure headers** centralize API response hardening.

### Database

- **Drizzle ORM** replaces SQL strings, positional bindings, and direct D1 statement preparation in application repositories.
- **Drizzle Kit** owns schema diffs and migration generation.
- **Cloudflare D1** remains the production database; the local adapter implements the D1 API required by Drizzle, including array-mode `raw()` results.

## Completion Boundary

The swap is complete only when:

1. The browser entrypoint is React and no retired vanilla UI files remain.
2. All API routes are declared in Hono and request bodies are Zod-validated.
3. All application persistence uses Drizzle query builders; direct D1 preparation is limited to local migration infrastructure.
4. The old schema materializer and custom validators are removed.
5. API, readiness, production build, and responsive browser checks pass.
