CREATE TABLE "trash" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"path" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trash" ADD CONSTRAINT "trash_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trash_user_deleted_idx" ON "trash" USING btree ("user_id","deleted_at" DESC NULLS LAST);