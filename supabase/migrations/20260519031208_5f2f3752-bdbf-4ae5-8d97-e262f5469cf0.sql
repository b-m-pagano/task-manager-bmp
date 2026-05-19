ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS series_id uuid NULL,
  ADD COLUMN IF NOT EXISTS recurrence_end_date date NULL;

CREATE INDEX IF NOT EXISTS tasks_series_id_idx ON public.tasks(series_id) WHERE series_id IS NOT NULL;