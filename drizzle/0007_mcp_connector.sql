ALTER TABLE "user_settings" ADD COLUMN "mcp_token_hash" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_mcp_token_hash_unique" UNIQUE("mcp_token_hash");