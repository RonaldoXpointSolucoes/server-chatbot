import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: 'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres'
});

async function migrate() {
  try {
    await client.connect();
    console.log('Connected to DB');

    await client.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;

      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;

      CREATE TABLE IF NOT EXISTS labels (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS conversation_labels (
          conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          PRIMARY KEY (conversation_id, label_id)
      );

      ALTER TABLE labels ENABLE ROW LEVEL SECURITY;
      ALTER TABLE conversation_labels ENABLE ROW LEVEL SECURITY;
    `);

    try {
        await client.query(`
            CREATE POLICY "Enable all for authenticated users" ON labels FOR ALL USING (true) WITH CHECK (true);
        `);
    } catch(e) {}
    
    try {
        await client.query(`
            CREATE POLICY "Enable all for authenticated users" ON conversation_labels FOR ALL USING (true) WITH CHECK (true);
        `);
    } catch(e) {}

    console.log('Migração com sucesso');
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

migrate();
