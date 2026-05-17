import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCategories } from "@/lib/categories.functions";

export const Route = createFileRoute("/_authenticated/app/categories")({
  component: CategoriesPage,
});

function CategoriesPage() {
  const fn = useServerFn(listCategories);
  const { data } = useQuery({ queryKey: ["categories"], queryFn: () => fn({ data: undefined as never }) });
  return (
    <div className="p-8">
      <h1 className="text-base font-semibold">Categorias</h1>
      <ul className="mt-4 space-y-2">
        {(data ?? []).map((c: any) => (
          <li key={c.id} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
            {c.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
