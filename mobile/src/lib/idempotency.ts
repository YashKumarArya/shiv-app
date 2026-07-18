/**
 * A payment-intent identifier only needs collision resistance, not secrecy.
 * Prefer the platform UUID implementation and retain a Hermes-safe fallback.
 */
export const createPaymentIdempotencyKey = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `pay:${uuid}`;
  const randomPart = () => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
  return `pay:${Date.now().toString(36)}:${randomPart()}:${randomPart()}`;
};
