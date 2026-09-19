import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DeleteScope = "single" | "future" | "all";

interface DeleteTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasSeries: boolean;
  onConfirm: (scope: DeleteScope) => void;
}

const destructiveAction = "bg-destructive text-destructive-foreground hover:bg-destructive/90";

/** Confirmation dialog for deleting a task; offers series scope (single/future/all) when applicable. */
export function DeleteTaskDialog({
  open,
  onOpenChange,
  hasSeries,
  onConfirm,
}: DeleteTaskDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {hasSeries ? "Excluir tarefa recorrente?" : "Excluir tarefa?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasSeries
              ? "Esta tarefa faz parte de uma série recorrente. Escolha o escopo da exclusão."
              : "Esta ação não pode ser desfeita. Subtarefas associadas permanecerão (sem pai)."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          {hasSeries ? (
            <>
              <AlertDialogAction onClick={() => onConfirm("single")} className={destructiveAction}>
                Apenas esta
              </AlertDialogAction>
              <AlertDialogAction onClick={() => onConfirm("future")} className={destructiveAction}>
                Esta e futuras
              </AlertDialogAction>
              <AlertDialogAction onClick={() => onConfirm("all")} className={destructiveAction}>
                Toda a série
              </AlertDialogAction>
            </>
          ) : (
            <AlertDialogAction onClick={() => onConfirm("single")} className={destructiveAction}>
              Excluir
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
