// Predeploy step for the "api" Functions codebase (see firebase.json).
// backend/ itself can't be the Functions source directory: Cloud Functions
// unconditionally reads whatever .env file sits in the source dir (the
// `ignore` list only controls what's packaged as code, not this), and
// backend/.env legitimately needs FIREBASE_SERVICE_ACCOUNT_JSON/PORT for
// the LIVE Render app (src/auth/firebase-admin.ts) and other scripts -
// renaming or removing them there would break things that already work.
// So the deployed function lives in its own directory instead, built fresh
// from backend's compiled output on every deploy: copies backend/dist here
// and generates a package.json from backend/package.json's own
// `dependencies` (never hand-duplicated, so it can't drift out of sync).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGET = path.join(ROOT, 'functions-api');

fs.rmSync(path.join(TARGET, 'dist'), { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'dist'), path.join(TARGET, 'dist'), { recursive: true });

// @prisma/client's package alone is just a loader - the actual enum/model
// code (Role.SHOP_ADMIN etc., which firestore-customer.controller.ts and
// every @Roles() decorator reference) only exists after `prisma generate`
// runs against prisma/schema.prisma. Cloud Functions' own `npm install`
// doesn't trigger this (postinstall scripts aren't reliably run), so both
// the schema and the generation step are bundled explicitly here via
// Google's documented `gcp-build` buildpack hook, which runs after
// dependency install and before the final image is built - the officially
// supported way to do a Prisma generate step in this environment.
fs.rmSync(path.join(TARGET, 'prisma'), { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'prisma', 'schema.prisma'), path.join(TARGET, 'prisma', 'schema.prisma'));

const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const pkg = {
  name: 'kee-backend-functions-api',
  version: rootPkg.version,
  private: true,
  main: 'dist/src/functions-main.js',
  engines: { node: '22' },
  scripts: { 'gcp-build': 'prisma generate' },
  dependencies: { ...rootPkg.dependencies, prisma: rootPkg.devDependencies.prisma },
};
fs.writeFileSync(path.join(TARGET, 'package.json'), JSON.stringify(pkg, null, 2));

console.log(`prepare-functions-api: copied dist/+prisma schema and generated package.json with ${Object.keys(pkg.dependencies).length} dependencies into functions-api/`);
