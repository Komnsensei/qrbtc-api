// Run Supabase migrations for DOI system columns
// Usage: Set SUPABASE_URL and SUPABASE_SERVICE_KEY, then run: node migrate.cjs

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yezokjwijcwkiwtujnfs.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('ERROR: Set SUPABASE_SERVICE_KEY environment variable');
  console.error('Get it from: https://supabase.com/dashboard/project/yezokjwijcwkiwtujnfs/settings/api');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runSQL(sql, label) {
  try {
    const { data, error } = await db.rpc('exec_sql', { sql });
    if (error) {
      // Try direct fetch if rpc doesn't exist
      console.log(`  [${label}] RPC not available, trying direct...`);
      return false;
    }
    console.log(`  [${label}] OK`);
    return true;
  } catch (e) {
    console.log(`  [${label}] ${e.message}`);
    return false;
  }
}

async function migrate() {
  console.log('=== QuantumPass DOI System Migration ===\n');

  // We'll use direct column additions via REST
  // Since we can't run raw SQL easily, let's test what columns exist
  // and document what needs to be added via Supabase Dashboard

  console.log('REQUIRED SCHEMA CHANGES:\n');
  
  console.log('1. TABLE: passports — ADD COLUMNS:');
  console.log('   ALTER TABLE passports ADD COLUMN IF NOT EXISTS hex_id TEXT UNIQUE;');
  console.log('   ALTER TABLE passports ADD COLUMN IF NOT EXISTS genesis_doi TEXT;');
  console.log('   ALTER TABLE passports ADD COLUMN IF NOT EXISTS genesis_doi_url TEXT;');
  console.log('   ALTER TABLE passports ADD COLUMN IF NOT EXISTS zenodo_token TEXT;');
  console.log('   ALTER TABLE passports ADD COLUMN IF NOT EXISTS is_agent BOOLEAN DEFAULT false;');
  console.log('   ALTER TABLE passports ADD COLUMN IF NOT EXISTS agent_owner_id UUID REFERENCES passports(id);');
  console.log('   ALTER TABLE passports ADD COLUMN IF NOT EXISTS agent_available BOOLEAN DEFAULT false;');
  console.log('   ALTER TABLE passports ADD COLUMN IF NOT EXISTS agent_description TEXT;');
  console.log('   ALTER TABLE passports ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;');
  console.log('');

  console.log('2. TABLE: sessions — ADD COLUMNS:');
  console.log('   ALTER TABLE sessions ADD COLUMN IF NOT EXISTS doi TEXT;');
  console.log('   ALTER TABLE sessions ADD COLUMN IF NOT EXISTS doi_url TEXT;');
  console.log('   ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tier_at_time TEXT;');
  console.log('   ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_agent_session BOOLEAN DEFAULT false;');
  console.log('   ALTER TABLE sessions ADD COLUMN IF NOT EXISTS agent_accumulation_rate NUMERIC DEFAULT 1.0;');
  console.log('');

  console.log('3. NEW TABLE: chainlinks');
  console.log(`   CREATE TABLE IF NOT EXISTS chainlinks (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     initiator_id UUID REFERENCES passports(id),
     target_id UUID REFERENCES passports(id),
     hex_id_a TEXT NOT NULL,
     hex_id_b TEXT NOT NULL,
     alignment_score NUMERIC,
     collab_bonus NUMERIC,
     link_hash TEXT,
     trusted BOOLEAN DEFAULT true,
     doi TEXT,
     doi_url TEXT,
     created_at TIMESTAMPTZ DEFAULT now(),
     UNIQUE(initiator_id, target_id)
   );`);
  console.log('');

  console.log('4. NEW TABLE: beads');
  console.log(`   CREATE TABLE IF NOT EXISTS beads (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     passport_id UUID REFERENCES passports(id),
     hex_id TEXT NOT NULL,
     bead_type TEXT NOT NULL,
     bead_content TEXT,
     session_context TEXT,
     tier_at_time TEXT,
     total_degrees NUMERIC,
     doi TEXT,
     doi_url TEXT,
     created_at TIMESTAMPTZ DEFAULT now()
   );`);
  console.log('');

  console.log('5. NEW TABLE: decay_events');
  console.log(`   CREATE TABLE IF NOT EXISTS decay_events (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     passport_id UUID REFERENCES passports(id),
     hex_id TEXT NOT NULL,
     days_inactive INTEGER,
     degrees_lost NUMERIC,
     degrees_before NUMERIC,
     degrees_after NUMERIC,
     tier_before TEXT,
     tier_after TEXT,
     decay_rate NUMERIC,
     doi TEXT,
     doi_url TEXT,
     created_at TIMESTAMPTZ DEFAULT now()
   );`);
  console.log('');

  console.log('6. NEW TABLE: awards');
  console.log(`   CREATE TABLE IF NOT EXISTS awards (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     passport_id UUID REFERENCES passports(id),
     hex_id TEXT NOT NULL,
     award_name TEXT NOT NULL,
     award_reason TEXT,
     degrees_bonus NUMERIC,
     tier_at_time TEXT,
     doi TEXT,
     doi_url TEXT,
     created_at TIMESTAMPTZ DEFAULT now()
   );`);
  console.log('');

  console.log('7. NEW TABLE: trust_recommendations');
  console.log(`   CREATE TABLE IF NOT EXISTS trust_recommendations (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     passport_id UUID REFERENCES passports(id),
     recommender_id UUID REFERENCES passports(id),
     hex_id TEXT NOT NULL,
     recommender_hex_id TEXT NOT NULL,
     recommender_tier TEXT,
     recommendation_weight NUMERIC,
     context TEXT,
     doi TEXT,
     doi_url TEXT,
     created_at TIMESTAMPTZ DEFAULT now()
   );`);
  console.log('');

  console.log('=========================================');
  console.log('Run these in Supabase Dashboard SQL Editor:');
  console.log('https://supabase.com/dashboard/project/yezokjwijcwkiwtujnfs/sql');
  console.log('=========================================');
}

migrate();
