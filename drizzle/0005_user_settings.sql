CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"habits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Contas que já existem ficam com a lista que era fixa no app.
INSERT INTO "user_settings" ("user_id", "habits")
SELECT "id", '["Exercício","Leitura","Alongamento WU","Estudar","Passeio"]'::jsonb FROM "user"
ON CONFLICT DO NOTHING;
