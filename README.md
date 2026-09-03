# Seminar Management Portal

The Horana Sub Group portal manages seminar schedules, school profiles,
contacts, reports, and role-based access. It is a React/Vite application backed
by Firebase Authentication and Cloud Firestore.

## Local development

Use Node.js 24 or newer:

```sh
npm ci
npm run dev
```

The local portal is available at
`http://localhost:5173/Seminar-management-portal/`.

## Verification

```sh
npm run lint
npm test
npm run test:ui
npm run test:rules
npm run build
```

The Firestore Rules suite starts the local emulator and requires Java 21 or
newer. See [FIREBASE_SECURITY.md](./FIREBASE_SECURITY.md) for the access model
and rules deployment instructions.

## Automatic GitHub Pages deployment

The workflow in `.github/workflows/deploy-pages.yml` runs on every push to
`main`. It installs locked dependencies, runs linting and all test suites,
builds the production site, and deploys `dist` only if every check passes. It
can also be started manually from the repository's **Actions** tab.

One repository setting is required: open **Settings → Pages → Build and
deployment**, then set **Source** to **GitHub Actions**. The Vite base path is
already configured for:

```text
https://laraweerarathna.github.io/Seminar-management-portal/
```

## Production bundle

Portal pages use route-level lazy loading. Firebase Authentication remains in
the public sign-in bundle, while the larger Firestore client is downloaded only
after a user signs in. This keeps the first page load small and gives each tab
its own cacheable JavaScript chunk.
