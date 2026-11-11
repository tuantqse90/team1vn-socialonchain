-- Tìm kiếm không dấu (tiếng Việt): unaccent + hàm IMMUTABLE để dùng được trong index.
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, replace(replace(lower($1), 'đ', 'd'), 'Đ', 'd')) $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS posts_text_trgm_idx ON chain.posts USING gin (app.f_unaccent(text) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fc_posts_text_trgm_idx ON app.fc_posts USING gin (app.f_unaccent(text) gin_trgm_ops);
