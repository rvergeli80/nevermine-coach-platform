import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

export function QueryState({
  isLoading,
  error,
  isEmpty,
  emptyText,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyText?: string;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <p role="status" className="py-8 text-center text-sm text-muted-foreground">
        Cargando…
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" className="py-8 text-center text-sm text-destructive">
        {error instanceof Error ? error.message : "No se han podido cargar los datos."}
      </p>
    );
  }
  if (isEmpty) {
    return (
      <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        {emptyText ?? "Todavía no hay nada aquí."}
      </p>
    );
  }
  return <>{children}</>;
}
