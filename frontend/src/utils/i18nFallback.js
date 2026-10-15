// t(key) with an English fallback for keys that only exist in English (Super Admin tools), and {name} placeholders filled in.
export function txt(t, key, fallback, vars = {}) {
  const raw = t(key);
  const base = !raw || raw === key ? fallback : raw;
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), base);
}
