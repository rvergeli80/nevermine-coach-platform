/**
 * Desempaqueta una respuesta de PostgREST lanzando un error legible.
 */
export function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}
