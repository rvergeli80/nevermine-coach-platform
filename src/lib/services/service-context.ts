import type { ApplicationContext } from "@/modules/application-context";

/**
 * FEATURE-002.6 — Contrato de los Application Services.
 *
 * Un servicio de aplicación recibe siempre un contexto ya resuelto (usuario +
 * SportSpace activo) y un cliente de datos que actúa como ese usuario, de modo
 * que RLS + Membership siguen siendo la única autorización. El servicio no sabe
 * si la petición llega por HTTP, MCP, CLI o cualquier canal futuro.
 */

export interface DataClient {
  from: (table: string) => any;
  /** Ejecución de funciones de base de datos (operaciones transaccionales). */
  rpc?: (fn: string, args?: Record<string, unknown>) => any;
}


export interface ApplicationServiceContext extends ApplicationContext {
  supabase: DataClient;
}
