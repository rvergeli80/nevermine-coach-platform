/**
 * Desfase de reloj: un token recién emitido puede llegar con `iat` unos
 * milisegundos en el futuro respecto al validador, que lo rechaza con
 * "JWT issued at future". Es transitorio: basta reintentar tras una pausa.
 */
const SKEW_PATTERN = /issued at future|jwt.*not yet valid/i;

export function isClockSkewError(message: string | null | undefined): boolean {
  return typeof message === "string" && SKEW_PATTERN.test(message);
}

export async function withClockSkewRetry<T>(
  run: () => Promise<{ data: T; error: { message: string } | null }>,
  delayMs = 1200,
): Promise<{ data: T; error: { message: string } | null }> {
  const first = await run();
  if (!first.error || !isClockSkewError(first.error.message)) return first;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return run();
}
