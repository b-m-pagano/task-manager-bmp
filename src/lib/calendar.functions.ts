import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Sync Google Calendar events for a date range.
 * Token vem do provider_token salvo na sessão Supabase (Google OAuth).
 * O cliente passa o token; alternativa seria recuperar via auth.admin.
 */
export const syncCalendarRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        provider_token: z.string().min(20),
        from: z.string().regex(ISO_DATE),
        to: z.string().regex(ISO_DATE),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const timeMin = new Date(`${data.from}T00:00:00`).toISOString();
    const timeMax = new Date(`${data.to}T23:59:59`).toISOString();

    const url = new URL(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${data.provider_token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Google ${res.status}: ${text}` };
    }
    const json = (await res.json()) as {
      items?: Array<{
        id: string;
        summary?: string;
        description?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
    };

    const items = json.items ?? [];

    // Replace events in window for this user
    await supabase
      .from("calendar_events")
      .delete()
      .gte("starts_at", timeMin)
      .lte("ends_at", timeMax);

    if (items.length > 0) {
      const rows = items.map((e) => {
        const allDay = !e.start?.dateTime;
        const starts = e.start?.dateTime ?? `${e.start?.date}T00:00:00`;
        const ends = e.end?.dateTime ?? `${e.end?.date}T23:59:59`;
        return {
          user_id: userId,
          google_event_id: e.id,
          calendar_id: "primary",
          title: e.summary ?? "(sem título)",
          description: e.description ?? null,
          starts_at: new Date(starts).toISOString(),
          ends_at: new Date(ends).toISOString(),
          all_day: allDay,
        };
      });
      await supabase.from("calendar_events").upsert(rows, {
        onConflict: "user_id,google_event_id",
      });
    }

    await supabase
      .from("google_connections")
      .upsert({ user_id: userId, last_sync_at: new Date().toISOString() });

    return { ok: true, count: items.length };
  });
