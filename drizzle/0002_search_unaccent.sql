-- Busca sem acento (Ctrl+K): "diario" encontra "Diário".
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;--> statement-breakpoint
-- unaccent() não é IMMUTABLE; este wrapper é, e pode ser usado em coluna gerada.
CREATE OR REPLACE FUNCTION public.f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "search_text" text GENERATED ALWAYS AS (f_unaccent(lower("notes"."title" || chr(10) || "notes"."body"))) STORED;--> statement-breakpoint
CREATE INDEX "notes_search_text_trgm_idx" ON "notes" USING gin ("search_text" gin_trgm_ops);