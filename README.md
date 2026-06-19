# DCDcom Mobile Intake

A mobile-first prototype for DCDcom.com that turns customer calls, emails, texts, or manual notes into a structured decommissioning opportunity.

## What It Includes

- Today and pipeline queues modeled after the supplied mobile references.
- Add Inquiry flow with call note, email, manual, and photo/OCR input modes.
- Mock AI extraction preview with confidence, captured fields, and missing information.
- Review detail screen with AI summary, missing details, extracted contact data, and next actions.
- Follow-up email generator with tone controls, include toggles, editable draft, regenerate, copy, and save behavior.
- Proposal draft with tabs, approval state, confidence score, and review workflow.

## Project Structure

- `public/` contains the static HTML entry, stylesheet, and tiny browser bootstrap.
- `src/state/` contains app state and mock DCDcom opportunity data.
- `src/lib/` contains reusable extraction, draft, and icon utilities.
- `src/ui/components.js` contains shared UI primitives.
- `src/ui/screens/` contains one module per mobile screen.
- `scripts/` contains the local development server and Sites-compatible build script.

## Commands

```bash
npm run dev
npm run build
```

The build output is written to `dist/` with `dist/server/index.js`, `dist/client/**`, and `dist/.openai/hosting.json` for Sites hosting.
