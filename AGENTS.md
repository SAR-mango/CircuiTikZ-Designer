# CircuiTikZ-Designer Context

## Purpose

CircuiTikZ-Designer is an interactive visual editor for building electrical circuit diagrams and exporting them as LaTeX/CircuiTikZ code. The main web app is built with Parcel, TypeScript, SCSS, and SVG-based canvas interactions. The repository also includes Electron entry points for desktop packaging.

## Working Assumptions

- Prefer repo-local context from this file before making changes.
- Preserve existing project structure and naming unless there is a clear reason to refactor.
- Favor small, targeted changes over broad rewrites.
- Do not assume test coverage exists; validate with focused builds or manual checks when possible.

## Key Commands

- `npm start`: run the Parcel dev server.
- `npm run build`: build the web app into `dist/`.
- `npm run standalone`: start the Electron app in development.
- `npm run electron`: build and launch the Electron app.
- `npm run package`: package the Electron app.
- `npm run make`: create Electron distributables.

## Repository Map

- `src/pages/`: HTML, manifest, and static page-level assets.
- `src/scripts/index.ts`: TypeScript entry point for the web app.
- `src/scripts/controllers/`: UI and workflow controllers such as canvas, export, save, selection, and properties.
- `src/scripts/components/`: diagram element implementations such as wires, shapes, paths, nodes, and grouped components.
- `src/scripts/properties/`: property editor models and input types.
- `src/scripts/snapDrag/`: snapping and drag behavior.
- `src/scripts/utils/`: shared helpers including TikZ generation.
- `src/styles/`: SCSS for the app UI.
- `src/data/`: bundled SVG symbol data.
- `scripts/`: auxiliary repository scripts.

## Architecture Notes

- The editor is controller-driven. Changes to selection, export, save behavior, or canvas interaction usually belong under `src/scripts/controllers/`.
- Diagram primitives and symbol-backed entities live under `src/scripts/components/`.
- TikZ export behavior is likely centered in `src/scripts/utils/tikzBuilder.ts` and related export controller logic.
- UI styling is SCSS-based and already split by feature area; extend the relevant stylesheet instead of introducing catch-all styles.

## Change Guidelines

- Keep TypeScript changes aligned with the current code style; avoid introducing new frameworks or patterns that are not already used here.
- When editing UI behavior, check whether there is corresponding logic in both controllers and component/property classes.
- If a change affects export behavior, verify the generated output path as well as the interactive editor behavior.
- If a change affects build output, prefer verifying with `npm run build`.

## Verification Expectations

- Minimum verification for code changes: run the most relevant command for the touched area when feasible.
- For UI-only changes that are not easily covered by automated checks, note what should be manually exercised.
- If verification cannot be run, say so explicitly.

## Notes For Future Agent Work

- There is currently no dedicated automated test suite defined in `package.json`.
- `dist/` is generated output; prefer changing source files under `src/` unless the task is explicitly about generated artifacts.
- The package name in `package.json` is currently spelled `circutikz-designer`; treat that as existing repo state unless the task is to correct it.
