-- Finance Management System Migration
-- Adds finance_logs table for tracking income and expenses

CREATE TABLE IF NOT EXISTS public.finance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Financial Data
  amount NUMERIC(12, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL CHECK (category IN ('work', 'food', 'gas', 'rent', 'other')),
  
  -- Description/Notes
  description TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_finance_logs_user_id ON public.finance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_logs_logged_at ON public.finance_logs(user_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_logs_type ON public.finance_logs(user_id, type);

-- RLS
ALTER TABLE public.finance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own finance logs"
  ON public.finance_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own finance logs"
  ON public.finance_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own finance logs"
  ON public.finance_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own finance logs"
  ON public.finance_logs FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to finance logs"
  ON public.finance_logs FOR ALL
  USING (auth.role() = 'service_role');
