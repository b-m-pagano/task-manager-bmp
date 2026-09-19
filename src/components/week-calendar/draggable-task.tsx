import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EventCard } from "./event-card";
import { DAY_START_HOUR, PX_PER_MIN, minuteToTop } from "./time-grid";
import type { CalendarCategory, CalendarEvent, CalendarProject } from "./types";

const AFTER_HOURS_MIN = 18 * 60;

const SNAP_MIN = 15;
const DRAG_THRESHOLD = 4;

export interface DragDrop {
  /** New day this card landed on (iso). */
  day: string;
  /** New start minute (snapped). */
  startMinute: number;
}

interface Props {
  event: CalendarEvent;
  category?: CalendarCategory;
  project?: CalendarProject;
  onClick: () => void;
  /** Called once the user releases on a valid column. */
  onDrop: (d: DragDrop) => void;
  /** Toggle the task's done/pending status from the status icon. */
  onToggleStatus?: () => void;
  /** True while the status mutation is in-flight (shows spinner). */
  isTogglingStatus?: boolean;
  /** Map of day iso → column element, used to resolve cross-column drops. */
  columnRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  laneIndex?: number;
  laneCount?: number;
}

export function DraggableTask({
  event,
  category,
  project,
  onClick,
  onDrop,
  onToggleStatus,
  isTogglingStatus,
  columnRefs,
  laneIndex,
  laneCount,
}: Props) {
  const [dragging, setDragging] = React.useState(false);
  const [ghost, setGhost] = React.useState<{ dx: number; dy: number } | null>(null);
  const startRef = React.useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const previewRef = React.useRef<DragDrop | null>(null);

  function resolveColumn(x: number, y: number): { day: string; offsetY: number } | null {
    const entries = Object.entries(columnRefs.current);
    for (const [day, el] of entries) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return { day, offsetY: y - r.top };
      }
    }
    return null;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY, moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = startRef.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!s.moved) {
      s.moved = true;
      setDragging(true);
    }
    setGhost({ dx, dy });
    const hit = resolveColumn(e.clientX, e.clientY);
    if (hit) {
      const rawMin = hit.offsetY / PX_PER_MIN + DAY_START_HOUR * 60;
      const snapped = Math.round(rawMin / SNAP_MIN) * SNAP_MIN;
      previewRef.current = { day: hit.day, startMinute: snapped };
    } else {
      previewRef.current = null;
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const s = startRef.current;
    startRef.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!s) return;
    if (!s.moved) {
      onClick();
    } else if (previewRef.current) {
      const p = previewRef.current;
      if (p.day !== event.day || p.startMinute !== event.startMinute) {
        onDrop(p);
      }
    }
    setDragging(false);
    setGhost(null);
    previewRef.current = null;
  }

  const wrapperStyle: React.CSSProperties = dragging
    ? {
        transform: `translate3d(${ghost?.dx ?? 0}px, ${ghost?.dy ?? 0}px, 0)`,
        zIndex: 50,
        pointerEvents: "none",
        opacity: 0.92,
      }
    : {};

  return (
    <>
      {/* Drop preview indicator — placed on the target column at snapped time. */}
      {dragging && previewRef.current && (
        <DropPreview
          day={previewRef.current.day}
          startMinute={previewRef.current.startMinute}
          durationMinutes={event.durationMinutes}
          columnRefs={columnRefs}
        />
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          "relative z-[1] touch-none",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        style={wrapperStyle}
      >
        <EventCard event={event} category={category} project={project} onToggleStatus={onToggleStatus} isTogglingStatus={isTogglingStatus} laneIndex={laneIndex} laneCount={laneCount} />
      </div>
    </>
  );
}

function DropPreview({
  day,
  startMinute,
  durationMinutes,
  columnRefs,
}: {
  day: string;
  startMinute: number;
  durationMinutes: number;
  columnRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
}) {
  const col = columnRefs.current[day];
  if (!col) return null;
  const endMinute = startMinute + durationMinutes;
  const startsAfterHours = startMinute >= AFTER_HOURS_MIN;
  const endsAfterHours = endMinute > AFTER_HOURS_MIN;
  const isAfterHours = startsAfterHours || endsAfterHours;
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const warningLabel = startsAfterHours
    ? `Início ${fmt(startMinute)} após 18h`
    : `Fim ${fmt(endMinute)} após 18h`;

  const node = (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-1 z-[60] rounded-md border-2 border-dashed",
        isAfterHours
          ? "border-after-hours bg-after-hours/15 ring-2 ring-after-hours/30"
          : "border-primary bg-primary/10",
      )}
      style={{
        top: minuteToTop(startMinute),
        height: Math.max(24, durationMinutes * PX_PER_MIN - 2),
      }}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-1 px-2 py-0.5 text-[10px] font-semibold tabular-nums",
          isAfterHours ? "text-after-hours" : "text-primary",
        )}
      >
        <span>{fmt(startMinute)}</span>
        {isAfterHours && (
          <span className="inline-flex items-center gap-0.5 rounded-sm bg-after-hours/20 px-1 py-px text-[9px] uppercase tracking-wide">
            <AlertTriangle className="h-2.5 w-2.5" />
            <span>após 18h</span>
          </span>
        )}
      </div>
      {isAfterHours && (
        <div className="px-2 text-[9.5px] font-medium text-after-hours/90">
          {warningLabel}
        </div>
      )}
    </div>
  );
  return <PortalInto host={col}>{node}</PortalInto>;
}

function PortalInto({
  host,
  children,
}: {
  host: HTMLElement;
  children: React.ReactNode;
}) {
  const [mount, setMount] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const div = document.createElement("div");
    host.appendChild(div);
    setMount(div);
    return () => {
      try {
        host.removeChild(div);
      } catch {
        /* ignore */
      }
    };
  }, [host]);
  if (!mount) return null;
  return createPortal(children, mount);
}
