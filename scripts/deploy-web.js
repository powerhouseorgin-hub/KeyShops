#!/usr/bin/env node
/*
 * Deploys the website (Firebase Hosting, target "default") WITH the Android APK
 * the landing page links to.
 *
 * Why this exists: `npm run build` empties frontend/dist, and the APK is
 * deliberately not kept in git (see .gitignore). A plain "build + firebase
 * deploy" therefore silently deletes /downloads/keyshop-app.keeapp, and
 * Firebase's SPA rewrite then serves index.html (a ~6 KB page) in its place,
 * so the landing page's download button hands out a broken "APK". This script
 * makes that impossible: it re-embeds a validated APK before every deploy and
 * checks the live file afterwards.
 *
 * Usage (from the repo root):
 *   node scripts/deploy-web.js                  build web, embed the latest local APK, deploy, verify
 *   node scripts/deploy-web.js --skip-build     reuse the existing frontend/dist
 *   node scripts/deploy-web.js --apk <path>     use a specific APK instead of the Gradle release output
 *   node scripts/deploy-web.js --keep-live-apk  no local APK (e.g. another machine): re-embed the one
 *                                               currently live so a web-only deploy can't remove it
 *   node scripts/deploy-web.js --dry-run        do everything except the actual firebase deploy
 *
 * Refuses to continue (exit 1) when the APK is missing, isn't a real APK, isn't
 * com.kee.app, or its versionCode differs from frontend/android/app/build.gradle
 * - that last check stops a stale build from replacing a newer live APK.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const GRADLE_FILE = path.join(FRONTEND, 'android', 'app', 'build.gradle');
const DEFAULT_APK = path.join(FRONTEND, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const DIST_APK = path.join(FRONTEND, 'dist', 'downloads', 'keyshop-app.keeapp');
const LIVE_URL = 'https://keyshops.in/downloads/keyshop-app.keeapp';
const APP_ID = 'com.kee.app';
const MIN_APK_BYTES = 5 * 1024 * 1024; // the real app is ~12 MB; the index.html fallback is ~6 KB

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argValue = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

function fail(msg) {
  console.error(`\n[deploy-web] ERROR: ${msg}`);
  process.exit(1);
}
function step(msg) { console.log(`\n[deploy-web] ${msg}`); }
function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: true, ...opts });
  if (r.status !== 0) fail(`"${cmd} ${cmdArgs.join(' ')}" failed (exit ${r.status}).`);
}
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function gradleVersion() {
  const text = fs.readFileSync(GRADLE_FILE, 'utf8');
  const code = /versionCode\s+(\d+)/.exec(text);
  const name = /versionName\s+"([^"]+)"/.exec(text);
  if (!code) fail(`Could not read versionCode from ${GRADLE_FILE}.`);
  return { code: Number(code[1]), name: name ? name[1] : '?' };
}

// aapt2/apksigner live in the Android SDK's newest build-tools folder.
function findBuildTools() {
  let sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const lp = path.join(FRONTEND, 'android', 'local.properties');
  if (!sdk && fs.existsSync(lp)) {
    const m = /^sdk\.dir=(.+)$/m.exec(fs.readFileSync(lp, 'utf8'));
    if (m) sdk = m[1].trim().replace(/\\\\/g, '\\').replace(/\\:/g, ':');
  }
  if (!sdk) return null;
  const bt = path.join(sdk, 'build-tools');
  if (!fs.existsSync(bt)) return null;
  const versions = fs.readdirSync(bt).filter((v) => /^\d/.test(v))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!versions.length) return null;
  return path.join(bt, versions[versions.length - 1]);
}

function validateApk(file, { expectGradleVersion }) {
  const size = fs.statSync(file).size;
  if (size < MIN_APK_BYTES) fail(`${file} is only ${size} bytes - that is not the app (expected > ${MIN_APK_BYTES}).`);
  const magic = fs.readFileSync(file).subarray(0, 2).toString('latin1');
  if (magic !== 'PK') fail(`${file} is not a valid APK/zip file.`);

  const bt = findBuildTools();
  if (!bt) {
    if (expectGradleVersion) fail('Android SDK build-tools not found (set ANDROID_HOME) - cannot verify the APK version. Refusing to deploy an unverified APK.');
    console.warn('[deploy-web] warning: Android build-tools not found; skipping APK version/signature checks.');
    return { code: null, name: null };
  }
  const aapt2 = path.join(bt, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2');
  const badging = spawnSync(aapt2, ['dump', 'badging', file], { encoding: 'utf8' });
  const m = /package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/.exec(badging.stdout || '');
  if (!m) fail(`aapt2 could not read ${file} - it is not a valid APK.`);
  const [, pkg, code, name] = m;
  if (pkg !== APP_ID) fail(`APK package is "${pkg}", expected "${APP_ID}".`);
  if (expectGradleVersion) {
    const g = gradleVersion();
    if (Number(code) !== g.code) {
      fail(`APK is versionCode ${code} (${name}) but frontend/android/app/build.gradle says ${g.code} (${g.name}). ` +
        'The APK is stale - rebuild it (./gradlew assembleRelease) so a deploy cannot replace the live app with an old build.');
    }
  }
  const signer = path.join(bt, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
  const v = spawnSync(signer, ['verify', file], { encoding: 'utf8', shell: true });
  if (v.status !== 0) fail(`apksigner rejected ${file}: ${(v.stdout || '') + (v.stderr || '')}`.trim());
  return { code: Number(code), name };
}

async function fetchLive(attempts = 6) {
  let last = '';
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${LIVE_URL}?cb=${Date.now()}`, { redirect: 'follow' });
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: res.status, type: res.headers.get('content-type'), buf };
    } catch (e) { last = e.message; }
    await new Promise((r) => setTimeout(r, 4000));
  }
  fail(`Could not download ${LIVE_URL}: ${last}`);
}

(async () => {
  // 1. build
  if (has('--skip-build')) {
    if (!fs.existsSync(path.join(FRONTEND, 'dist', 'index.html'))) fail('--skip-build given but frontend/dist does not exist.');
    step('Skipping build (using existing frontend/dist).');
  } else {
    step('Building the website (npm run build)...');
    run('npm', ['run', 'build'], { cwd: FRONTEND });
  }

  // 2. choose + validate the APK
  fs.mkdirSync(path.dirname(DIST_APK), { recursive: true });
  let source;
  if (has('--keep-live-apk')) {
    step('Downloading the currently live APK to re-embed it...');
    const live = await fetchLive();
    if (live.status !== 200) fail(`Live APK download returned HTTP ${live.status}.`);
    const tmp = path.join(FRONTEND, 'dist', 'downloads', '.live-apk.tmp');
    fs.writeFileSync(tmp, live.buf);
    const info = validateApk(tmp, { expectGradleVersion: false });
    fs.renameSync(tmp, DIST_APK);
    source = `currently live APK${info.name ? ` (v${info.name}, code ${info.code})` : ''}`;
  } else {
    const apk = path.resolve(argValue('--apk') || DEFAULT_APK);
    if (!fs.existsSync(apk)) {
      fail(`No APK at ${apk}.\n  Build one:  cd frontend/android && ./gradlew assembleRelease\n` +
        '  or re-embed the one already live:  node scripts/deploy-web.js --keep-live-apk');
    }
    step(`Validating ${path.relative(ROOT, apk)} ...`);
    const info = validateApk(apk, { expectGradleVersion: true });
    fs.copyFileSync(apk, DIST_APK);
    source = `${path.relative(ROOT, apk)} (v${info.name}, code ${info.code})`;
  }
  const localHash = sha256(DIST_APK);
  const localSize = fs.statSync(DIST_APK).size;
  console.log(`[deploy-web] Embedded APK: ${source}, ${(localSize / 1048576).toFixed(1)} MB, sha256 ${localHash.slice(0, 16)}...`);

  // 3. deploy
  if (has('--dry-run')) {
    step('Dry run - skipping "firebase deploy". frontend/dist is ready to deploy.');
    return;
  }
  step('Deploying to Firebase Hosting (target: default)...');
  run('firebase', ['deploy', '--only', 'hosting:default'], { cwd: ROOT });

  // 4. verify what is actually live
  step('Verifying the live download...');
  let ok = false;
  let detail = '';
  for (let i = 0; i < 6 && !ok; i++) {
    if (i) await new Promise((r) => setTimeout(r, 5000));
    const live = await fetchLive(2);
    const liveHash = crypto.createHash('sha256').update(live.buf).digest('hex');
    ok = live.status === 200 && live.buf.length === localSize && liveHash === localHash;
    detail = `HTTP ${live.status}, ${live.buf.length} bytes, content-type ${live.type}, sha256 ${liveHash.slice(0, 16)}...`;
  }
  if (!ok) fail(`The live APK does NOT match the one just deployed (${detail}). The landing-page download may be broken - check ${LIVE_URL} before leaving it.`);
  console.log(`[deploy-web] OK - live APK matches the deployed build (${detail}).`);
})().catch((e) => fail(e.stack || e.message));
