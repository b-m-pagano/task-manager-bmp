import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { format } from "date-fns";
import { MessageSquarePlus, Trash2, ListChecks, CalendarClock, ListTree, CheckCircle2, MoveRight, Plus, History, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { supabase } from "@/integrations/supabase/client";
import { getLocalTzOffsetMinutes } from "@/lib/timezone";
import {
  createAssistantThread, deleteAssistantThread, getAssistantMessages, listAssistantThreads,
} from "@/lib/ai/assistant.functions";
import mark from "@/assets/assistant-mark.png";

const TOOL_LABELS: Record<string, { label: string; icon: typeof ListChecks }> = {
  list_tasks: { label: "Consultando tarefas", icon: ListChecks },
  get_day_schedule: { label: "Lendo a agenda do dia", icon: CalendarClock },
  create_task: { label: "Criando tarefa", icon: Plus },
  decompose_task: { label: "Quebrando em passos", icon: ListTree },
  set_task_status: { label: "Mudando situação", icon: CheckCircle2 },
  move_task: { label: "Movendo tarefa", icon: MoveRight },
  replan_day: { label: "Replanejando o dia", icon: CalendarClock },
  list_subtasks: { label: "Vendo os passos", icon: ListTree },
  create_task_with_subtasks: { label: "Criando tarefa com passos", icon: ListTree },
};
const SUGGESTIONS = [
  "O que tenho para hoje?",
  "Quebre minha tarefa mais longa de hoje em passos de 20 min",
  "Surgiu uma reunião às 15h de 1 hora, reorganize minha tarde",
];

function Mark({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-card ring-1 ring-border" style={{ width: size, height: size }}>
      <img src={mark} alt="Assistente" width={size} height={size} className="h-full w-full object-contain" />
    </span>
  );
}

export function AssistantPanel() {
  const search = useSearch({ strict: false }) as { chat?: string };
  const navigate = useNavigate();
  const open = search.chat !== undefined;
  const threadId = search.chat && search.chat !== "new" ? search.chat : null;
  const qc = useQueryClient();
  const listFn = useServerFn(listAssistantThreads);
  const createFn = useServerFn(createAssistantThread);
  const deleteFn = useServerFn(deleteAssistantThread);

  const setChat = (chat: string | undefined) =>
    navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, chat }), replace: true } as never);

  const threads = useQuery({ queryKey: ["assistant-threads"], queryFn: () => listFn(), enabled: open });

  const startNew = async () => {
    try {
      const id = await createFn();
      await qc.invalidateQueries({ queryKey: ["assistant-threads"] });
      setChat(id);
    } catch (e) {
      toast.error("Não consegui criar a conversa", { description: (e as Error).message });
    }
  };

  // Ao abrir sem conversa escolhida, retoma a mais recente ou cria uma.
  const booting = useRef(false);
  useEffect(() => {
    if (!open || threadId || !threads.data || booting.current) return;
    booting.current = true;
    if (threads.data[0]) setChat(threads.data[0].id);
    else void startNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, threadId, threads.data]);
  useEffect(() => { if (!open) booting.current = false; }, [open]);

  const remove = async (id: string) => {
    await deleteFn({ data: { id } });
    await qc.invalidateQueries({ queryKey: ["assistant-threads"] });
    if (id === threadId) setChat("new");
  };

  const [showList, setShowList] = useState(false);

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Assistente"
          className="fixed bottom-24 right-6 z-50 flex h-[min(640px,calc(100vh-8rem))] w-[min(460px,calc(100vw-2rem))] origin-bottom-right animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl duration-200"
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Mark size={24} />
            <span className="flex-1 text-sm font-semibold">Assistente</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Conversas" onClick={() => setShowList((v) => !v)}>
              <History className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Nova conversa" onClick={startNew}>
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Fechar" onClick={() => setChat(undefined)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative flex min-h-0 flex-1">
            {showList && (
              <aside className="absolute inset-y-0 left-0 z-10 flex w-52 flex-col border-r bg-card shadow-lg">
                <div className="flex-1 overflow-y-auto p-1">
                  {(threads.data ?? []).map((t) => (
                    <div key={t.id} className={`group flex items-center rounded-md text-xs ${t.id === threadId ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"}`}>
                      <button type="button" className="min-w-0 flex-1 truncate px-2 py-1.5 text-left" onClick={() => { setChat(t.id); setShowList(false); }} title={t.title}>
                        {t.title}
                      </button>
                      <button type="button" aria-label="Apagar conversa" className="p-1 opacity-0 group-hover:opacity-100" onClick={() => remove(t.id)}>
                        <Trash2 className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              </aside>
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              {threadId ? <ThreadLoader key={threadId} threadId={threadId} /> : (
                <div className="flex flex-1 items-center justify-center"><Shimmer>Abrindo conversa...</Shimmer></div>
              )}
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        aria-label={open ? "Fechar assistente" : "Abrir assistente"}
        onClick={() => setChat(open ? undefined : "new")}
        className="fixed bottom-6 right-6 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-card shadow-lg ring-1 ring-border transition-all hover:scale-105 hover:shadow-xl active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? <X className="h-5 w-5 text-foreground" /> : <img src={mark} alt="" className="h-10 w-10 object-contain" />}
      </button>
    </>
  );
}

function ThreadLoader({ threadId }: { threadId: string }) {
  const getFn = useServerFn(getAssistantMessages);
  const q = useQuery({
    queryKey: ["assistant-messages", threadId],
    queryFn: () => getFn({ data: { id: threadId } }),
    staleTime: Infinity,
  });
  if (q.isError) return <p className="p-4 text-sm text-destructive">Não consegui abrir essa conversa.</p>;
  if (!q.data) return <div className="flex flex-1 items-center justify-center"><Shimmer>Carregando...</Shimmer></div>;
  return <ChatWindow threadId={threadId} initial={q.data as unknown as UIMessage[]} />;
}

function ChatWindow({ threadId, initial }: { threadId: string; initial: UIMessage[] }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/assistant",
    headers: async () => {
      const { data } = await supabase.auth.getSession();
      return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
    },
    body: () => {
      const now = new Date();
      return {
        threadId,
        tz_offset_minutes: getLocalTzOffsetMinutes(),
        today: format(now, "yyyy-MM-dd"),
        now: format(now, "HH:mm"),
      };
    },
  }), [threadId]);

  const { messages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    messages: initial,
    transport,
    onFinish: () => {
      qc.invalidateQueries({ queryKey: ["assistant-threads"] });
      qc.invalidateQueries({ queryKey: ["assistant-messages", threadId] });
      // As ferramentas podem ter mudado tarefas: atualiza as telas.
      qc.invalidateQueries({ predicate: (q) => !String(q.queryKey[0]).startsWith("assistant") });
      inputRef.current?.focus();
    },
  });

  useEffect(() => { inputRef.current?.focus(); }, []);

  const send = (t: string) => {
    if (!t.trim() || status === "submitted" || status === "streaming") return;
    void sendMessage({ text: t.trim() });
    setText("");
    inputRef.current?.focus();
  };

  return (
    <>
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Mark size={48} />
              <p className="text-sm text-muted-foreground">Me diga o que mudou no seu dia, ou peça para quebrar uma tarefa em passos.</p>
              <div className="flex flex-col gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="outline" size="sm" className="h-auto whitespace-normal py-1.5 text-xs" onClick={() => send(s)}>{s}</Button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <Message key={m.id} from={m.role}>
              <MessageContent className={m.role === "user" ? "bg-primary text-primary-foreground" : "bg-transparent p-0"}>
                {m.parts.map((p, i) => {
                  if (p.type === "text") return m.role === "user"
                    ? <p key={i} className="whitespace-pre-wrap">{p.text}</p>
                    : <MessageResponse key={i}>{p.text}</MessageResponse>;
                  if (p.type.startsWith("tool-")) {
                    const tp = p as Extract<typeof p, { type: `tool-${string}` }> & { state: never; input: unknown; output: unknown; errorText?: string };
                    const name = p.type.slice(5);
                    const meta = TOOL_LABELS[name];
                    return (
                      <Tool key={i} defaultOpen={false}>
                        <ToolHeader type={tp.type as never} state={tp.state} title={meta?.label ?? name} />
                        <ToolContent>
                          <ToolInput input={tp.input} />
                          <ToolOutput output={tp.output as never} errorText={tp.errorText} />
                        </ToolContent>
                      </Tool>
                    );
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}
          {status === "submitted" && <Shimmer className="text-sm">Pensando...</Shimmer>}
          {error && <p className="text-sm text-destructive">Algo deu errado: {error.message}</p>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="border-t p-3">
        <PromptInput onSubmit={(msg) => send(msg.text ?? text)}>
          <PromptInputTextarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            placeholder="Ex.: atrasei 30 min, empurre o resto do dia"
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} disabled={!text.trim() && status === "ready"} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  );
}
