// Predeploy step for the "api" Functions codebase (see firebase.json).
//
// backend/ itself can't be the Functions source directory: Cloud Functions unconditionally reads whatever
// .env file sits in the source dir (the `ignore` list only controls what is packaged as code, not this), and
// backend/.env is the developer's local file for the scripts and the local server (service-account JSON,
// test keys, ...) - it must never be deployed. So the deployed function lives in its own directory,
// functions-api/ (with its own .env, gitignored), built fresh from backend's compiled output on every deploy:
// this copies backend/dist there and generates a package.json from backend/package.json's own
// `dependencies` (never hand-duplicated, so it cannot drift out of sync).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGET = path.join(ROOT, 'functions-api');

fs.rmSync(path.join(TARGET, 'dist'), { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'dist'), path.join(TARGET, 'dist'), { recursive: true });

// An earlier version of this script also bundled a database schema here; remove any stale copy.
fs.rmSync(path.join(TARGET, 'prisma'), { recursive: true, force: true });

const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const pkg = {
  name: 'kee-backend-functions-api',
  version: rootPkg.version,
  private: true,
  main: 'dist/src/functions-main.js',
  engines: { node: '22' },
  dependencies: { ...rootPkg.dependencies },
};
fs.writeFileSync(path.join(TARGET, 'package.json'), JSON.stringify(pkg, null, 2));

console.log(`prepare-functions-api: copied dist/ and generated package.json with ${Object.keys(pkg.dependencies).length} dependencies into functions-api/`);
