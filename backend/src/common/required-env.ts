// JWT_SECRET and ENCRYPTION_KEY both used to silently fall back to a
// hardcoded, publicly-visible value (committed in this source tree) if the
// real env var was ever unset, with only a console.error to notice. In
// production that's a real vulnerability, not just a footgun: anyone with
// source access could forge any user's JWT (including a Super Admin's) or
// decrypt every customer's Aadhaar/ID-proof number. Refusing to start is the
// only safe behavior once real user data is on the line - a crashed deploy
// is loud and immediately visible; a silently-degraded secret is not.
//
// Local development still works without ever setting these - only
// NODE_ENV=production enforces the hard failure, matching how
// SEED_SUPER_ADMIN_EMAIL/PASSWORD already document "leave unset for local
// dev, ALWAYS set real values in production" for the same reason.
export function getRequiredSecret(envVarName: string, devFallback: string): string {
  const value = process.env[envVarName];
  if (value) return value;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `${envVarName} is not set. Refusing to start in production with a hardcoded fallback secret - ` +
      `set ${envVarName} in the environment before deploying.`,
    );
  }

  console.error(
    `[SECURITY WARNING] ${envVarName} is not set - falling back to a hardcoded, publicly-visible value ` +
    `for local development only. This would refuse to start under NODE_ENV=production.`,
  );
  return devFallback;
}
