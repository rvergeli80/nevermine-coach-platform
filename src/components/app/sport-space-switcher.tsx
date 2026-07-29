import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { getApplicationContext, setApplicationContext } from "@/lib/application-context.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Selector del SportSpace activo (FEATURE-002.5).
 * Muestra únicamente SportSpaces con Membership; el cambio sólo actualiza el
 * contexto de la sesión y refresca los datos sin recargar la página.
 */
export function SportSpaceSwitcher() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const fetchContext = useServerFn(getApplicationContext);
  const activate = useServerFn(setApplicationContext);

  const context = useQuery({
    queryKey: ["application-context"],
    queryFn: () => fetchContext({}),
  });

  const change = useMutation({
    mutationFn: (sportSpaceId: string) => activate({ data: { sportSpaceId } }),
    onSuccess: async (result) => {
      queryClient.setQueryData(["application-context"], result);
      await queryClient.invalidateQueries();
      await router.invalidate();
      toast.success("SportSpace activo actualizado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const spaces = context.data?.spaces ?? [];
  const active = context.data?.activeSportSpaceId ?? undefined;

  return (
    <div className="px-4 pb-3">
      <p className="pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        SportSpace activo
      </p>
      {context.isLoading ? (
        <div className="h-9 animate-pulse rounded-md bg-muted" />
      ) : spaces.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No perteneces a ninguna organización todavía.
        </p>
      ) : (
        <Select
          value={active}
          disabled={change.isPending}
          onValueChange={(value) => {
            if (value !== active) change.mutate(value);
          }}
        >
          <SelectTrigger aria-label="SportSpace activo" className="w-full">
            <SelectValue placeholder="Selecciona un SportSpace" />
          </SelectTrigger>
          <SelectContent>
            {spaces.map((space) => (
              <SelectItem key={space.id} value={space.id}>
                {space.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
