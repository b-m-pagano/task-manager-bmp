ALTER TABLE public.tasks ADD COLUMN is_inbox boolean NOT NULL DEFAULT false;
CREATE INDEX idx_tasks_inbox ON public.tasks (user_id, created_at DESC) WHERE is_inbox = true;