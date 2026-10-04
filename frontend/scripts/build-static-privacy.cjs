// Generates frontend/public/privacy.html: a plain, server-rendered copy of the English privacy policy.
// The React page at /privacy-policy is client-rendered, so crawlers that do not run JavaScript (Meta's app-review
// validator, link previewers) only see an empty shell. This file gives them real text at https://keyshops.in/privacy.html.
// Re-run after editing the policy text:  node scripts/build-static-privacy.cjs
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dict = fs.readFileSync(path.join(root, 'src/i18n/publicTranslations.js'), 'utf8').replace('export default PUBLIC_LANGUAGES;', 'module.exports = PUBLIC_LANGUAGES;');
const m = { exports: {} };
new Function('module', 'exports', dict)(m, m.exports);
const en = m.exports.en;

const site = fs.readFileSync(path.join(root, 'src/components/PublicSite.jsx'), 'utf8');
const updated = (site.match(/PRIVACY_POLICY_LAST_UPDATED = '([\d-]+)'/) || [])[1];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const date = new Date(updated).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

const sections = [
  ['1', 'body'], ['2', 3], ['3', 'body'], ['4', 'body'], ['5', 'body'], ['6', 5], ['7', 'body'], ['8', 6], ['9', 'body'], ['10', 'body'], ['11', 'body'],
].map(([n, kind]) => {
  const title = esc(en[`privacySection${n}Title`]);
  if (kind === 'body') return `<h2>${title}</h2>\n<p>${esc(en[`privacySection${n}Body`])}</p>`;
  const items = Array.from({ length: kind }, (_, i) => `<li>${esc(en[`privacySection${n}Item${i + 1}`])}</li>`).join('\n');
  return `<h2>${title}</h2>\n<ul>\n${items}\n</ul>`;
}).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy | Key Shops</title>
<meta name="description" content="How Key Shops (keyshops.in) collects, uses and protects data.">
<link rel="canonical" href="https://keyshops.in/privacy.html">
<style>
body{font:16px/1.7 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2933;margin:0;background:#fff}
main{max-width:760px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:28px;margin:0 0 4px}
h2{font-size:18px;margin:28px 0 6px}
p,li{color:#3e4c59}
.meta{color:#7b8794;margin:0 0 8px}
a{color:#1d4ed8}
</style>
</head>
<body>
<main>
<h1>Privacy Policy</h1>
<p class="meta">${esc(en.privacyLastUpdatedPrefix)} ${esc(date)} &middot; <a href="https://keyshops.in/">keyshops.in</a></p>
${sections}
<p class="meta">To request deletion of your account and data, see <a href="https://keyshops.in/delete-account-request">keyshops.in/delete-account-request</a>.</p>
</main>
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'public/privacy.html'), html);
console.log('wrote public/privacy.html (' + html.length + ' bytes)');
