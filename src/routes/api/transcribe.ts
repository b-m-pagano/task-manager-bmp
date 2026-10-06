import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const MAX_BYTES = 20 * 1024 * 1024;

/** Voice → text for the Assistant: forwards a recording to the AI Gateway and streams the transcript back. */
export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace("Bearer ", "");
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!token || !url || !key) return new Response("Unauthorized", { status: 401 });
        if (!apiKey) return new Response("IA não configurada", { status: 500 });
        const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: claims } = await sb.auth.getClaims(token);
        if (!claims?.claims?.sub) return new Response("Unauthorized", { status: 401 });

        const len = Number(request.headers.get("content-length") ?? 0);
        if (len > MAX_BYTES) return new Response("Gravação longa demais", { status: 413 });
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || !file.size || file.size > MAX_BYTES || !file.type.startsWith("audio/")) {
          return new Response("Áudio inválido", { status: 400 });
        }

        const out = new FormData();
        out.append("model", "openai/gpt-transcribe");
        out.append("file", file, file.name || "recording.wav");
        out.append("response_format", "json");
        out.append("stream", "true");
        out.append("languages", "pt");
        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: out,
          signal: request.signal,
        });
        if (!upstream.ok) {
          const body = await upstream.text();
          console.error(`Transcription failed [${upstream.status}]: ${body}`);
          return new Response(body || "Falha na transcrição", { status: upstream.status });
        }
        return new Response(upstream.body, {
          status: upstream.status,
          headers: { "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
