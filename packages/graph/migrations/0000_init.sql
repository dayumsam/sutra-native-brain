CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  type text NOT NULL,
  key text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}',
  card_text text NOT NULL DEFAULT '',
  card_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', card_text)) STORED,
  embedding vector(1536),
  acl jsonb NOT NULL DEFAULT '{"audience":"tenant"}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, type, key)
);
--> statement-breakpoint
CREATE INDEX entities_tenant_type_idx ON entities (tenant_id, type);
--> statement-breakpoint
CREATE INDEX entities_card_tsv_idx ON entities USING gin (card_tsv);
--> statement-breakpoint
CREATE TABLE edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  type text NOT NULL,
  src uuid NOT NULL REFERENCES entities(id),
  dst uuid NOT NULL REFERENCES entities(id),
  properties jsonb NOT NULL DEFAULT '{}',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, type, src, dst, valid_from)
);
--> statement-breakpoint
CREATE INDEX edges_src_idx ON edges (tenant_id, src);
--> statement-breakpoint
CREATE INDEX edges_dst_idx ON edges (tenant_id, dst);
--> statement-breakpoint
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  source text NOT NULL,
  source_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}',
  acl jsonb NOT NULL DEFAULT '{"audience":"tenant"}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, source, source_id)
);
--> statement-breakpoint
CREATE TABLE chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  seq int NOT NULL,
  text text NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
  embedding vector(1536),
  UNIQUE (document_id, seq)
);
--> statement-breakpoint
CREATE INDEX chunks_tsv_idx ON chunks USING gin (tsv);
--> statement-breakpoint
CREATE TABLE doc_mentions (
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, entity_id)
);
--> statement-breakpoint
CREATE TABLE events (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL,
  source text NOT NULL,
  source_id text NOT NULL,
  op text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  acl jsonb NOT NULL DEFAULT '{}',
  observed_at timestamptz NOT NULL,
  processed_at timestamptz
);
--> statement-breakpoint
CREATE INDEX events_unprocessed_idx ON events (id) WHERE processed_at IS NULL;
--> statement-breakpoint
CREATE TABLE signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  trigger_key text NOT NULL,
  entity_id uuid REFERENCES entities(id),
  severity text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  signal_id uuid NOT NULL REFERENCES signals(id),
  status text NOT NULL DEFAULT 'pending',
  steps jsonb NOT NULL DEFAULT '[]',
  subgraph_snapshot jsonb,
  trace_id text,
  tokens_in int NOT NULL DEFAULT 0,
  tokens_out int NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  signal_id uuid NOT NULL REFERENCES signals(id),
  agent_run_id uuid REFERENCES agent_runs(id),
  status text NOT NULL DEFAULT 'new',
  content jsonb NOT NULL,
  audience jsonb NOT NULL DEFAULT '{"audience":"tenant"}',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE meta (
  tenant_id text NOT NULL,
  k text NOT NULL,
  v jsonb NOT NULL,
  PRIMARY KEY (tenant_id, k)
);
