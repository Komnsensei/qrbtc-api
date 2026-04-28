-- DOI Chain Lineage table
-- Every DOI event for every user, hash-linked into an unbroken provenance chain

CREATE TABLE IF NOT EXISTS doi_chain (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  passport_id UUID NOT NULL REFERENCES passports(id),
  hex_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  doi TEXT NOT NULL,
  doi_url TEXT,
  record_id BIGINT,
  event_type TEXT NOT NULL,
  polarity TEXT NOT NULL DEFAULT '+',
  chain_hash TEXT NOT NULL,
  previous_chain_hash TEXT NOT NULL DEFAULT 'genesis',
  previous_doi TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(passport_id, position),
  UNIQUE(doi)
);

-- Indexes for fast chain lookups
CREATE INDEX IF NOT EXISTS idx_doi_chain_passport ON doi_chain(passport_id, position DESC);
CREATE INDEX IF NOT EXISTS idx_doi_chain_hex ON doi_chain(hex_id);
CREATE INDEX IF NOT EXISTS idx_doi_chain_event ON doi_chain(event_type);
CREATE INDEX IF NOT EXISTS idx_doi_chain_doi ON doi_chain(doi);
