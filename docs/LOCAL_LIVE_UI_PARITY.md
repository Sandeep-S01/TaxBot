# Local/Live UI Parity

Use this checklist when the local UI looks different from the deployed site.

## Source Of Truth

The live app and local app must be compared by commit, not by folder name or ZIP file name.

This workspace was inspected as a plain file copy: it does not contain a `.git` directory, so commands like `git status` and `git log -1` cannot prove which GitHub commit it came from.

For reliable local work, clone the repository:

```powershell
git clone <repo-url>
cd TaxBot-main
git status
git log -1 --oneline
```

## Build Like Production

Production on Render uses:

```powershell
npm ci
npm run build
npm start
```

Use the same path locally when checking visual parity. `npm run dev` is useful during editing, but final comparison should use a production build.

## Navbar Regression Checks

The public Playwright baseline includes explicit navbar checks for:

- desktop navbar height
- centered desktop navigation links
- mobile menu visibility
- hidden desktop-only actions on mobile
- horizontal overflow
- readable controls

Run:

```powershell
npm run test:ui -- --grep "public frontend baseline"
```

When an intentional visual change is made, update snapshots:

```powershell
npm run test:ui:update -- --grep "public frontend baseline"
```

## Deploy Rule

After local checks pass, commit the exact source changes and deploy that commit. Do not deploy from a different branch or an untracked ZIP copy.
