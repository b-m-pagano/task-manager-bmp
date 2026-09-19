import { Repeat } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { defaultUntilFor, type RecurrenceFreq, type CustomUnit } from "@/lib/queue/recurrence";

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

interface RecurrenceFieldsProps {
  day: string;
  recFreq: "none" | RecurrenceFreq;
  setRecFreq: (v: "none" | RecurrenceFreq) => void;
  recInterval: number;
  setRecInterval: (v: number) => void;
  recUnit: CustomUnit;
  setRecUnit: (v: CustomUnit) => void;
  recWeekdays: number[];
  setRecWeekdays: (fn: (prev: number[]) => number[]) => void;
  recUntil: string;
  setRecUntil: (v: string) => void;
}

/** "Repetir" section of the task form — frequency, interval/unit, weekdays and end date. Create-mode only. */
export function RecurrenceFields({
  day,
  recFreq,
  setRecFreq,
  recInterval,
  setRecInterval,
  recUnit,
  setRecUnit,
  recWeekdays,
  setRecWeekdays,
  recUntil,
  setRecUntil,
}: RecurrenceFieldsProps) {
  return (
    <div className="grid gap-2 rounded-md border border-dashed p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-sm">
          <Repeat className="h-3.5 w-3.5" /> Repetir
        </Label>
        <Select value={recFreq} onValueChange={(v) => setRecFreq(v as typeof recFreq)}>
          <SelectTrigger className="h-8 w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Não repetir</SelectItem>
            <SelectItem value="daily">Diária</SelectItem>
            <SelectItem value="weekly">Semanal</SelectItem>
            <SelectItem value="biweekly">Quinzenal</SelectItem>
            <SelectItem value="monthly">Mensal</SelectItem>
            <SelectItem value="custom">Personalizada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {recFreq !== "none" && (
        <>
          {recFreq === "custom" && (
            <div className="flex items-end gap-2">
              <div className="grid gap-1">
                <Label className="text-xs">A cada</Label>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={recInterval}
                  onChange={(e) => setRecInterval(Math.max(1, Number(e.target.value) || 1))}
                  className="h-9 w-20"
                />
              </div>
              <Select value={recUnit} onValueChange={(v) => setRecUnit(v as CustomUnit)}>
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">dia(s)</SelectItem>
                  <SelectItem value="week">semana(s)</SelectItem>
                  <SelectItem value="month">mês(es)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {(recFreq === "weekly" ||
            recFreq === "biweekly" ||
            (recFreq === "custom" && recUnit === "week")) && (
            <div className="grid gap-1">
              <Label className="text-xs">Dias da semana (opcional)</Label>
              <div className="flex gap-1">
                {WEEKDAY_LABELS.map((lbl, i) => {
                  const active = recWeekdays.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        setRecWeekdays((prev) =>
                          prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
                        )
                      }
                      className={`h-8 w-8 rounded-md border text-xs ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background"
                      }`}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid gap-1">
            <Label htmlFor="t-rec-until" className="text-xs">
              Termina em
            </Label>
            <Input
              id="t-rec-until"
              type="date"
              value={recUntil}
              min={day}
              onChange={(e) => setRecUntil(e.target.value)}
              placeholder={defaultUntilFor(day)}
            />
            <p className="text-[11px] text-muted-foreground">
              Padrão: 3 meses a partir do dia ({defaultUntilFor(day)}). Máx. 365 ocorrências.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
