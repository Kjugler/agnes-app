/**
 * INTERNAL_PROXY_SECRET after trim, or null if unset/blank.
 *
 * Use for x-internal-proxy on agnes-next → deepquill proxy calls that validate this header.
 * Must stay aligned with deepquill helpers that read the same env (no implicit dev fallback):
 * only send a header when a non-empty secret is configured.
 */
export function getInternalProxySecretTrimmed(): string | null {
  const raw = process.env.INTERNAL_PROXY_SECRET;
  if (raw == null) return null;
  const t = String(raw).trim();
  return t !== '' ? t : null;
}
