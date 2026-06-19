import pkg from 'pg';
const { Client } = pkg;

(async () => {
    try {
        const client = new Client({
            connectionString: 'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres'
        });
        await client.connect();
        
        const sql = `
CREATE OR REPLACE FUNCTION sync_contact_tags_to_conversation_labels()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o campo tags foi atualizado ou se for uma nova linha com tags
  IF (TG_OP = 'INSERT' AND NEW.tags IS NOT NULL) OR (TG_OP = 'UPDATE' AND (OLD.tags IS DISTINCT FROM NEW.tags OR OLD.tags IS NULL AND NEW.tags IS NOT NULL)) THEN
    -- 1. Remover todas as labels das conversas deste contato
    DELETE FROM public.conversation_labels
    WHERE conversation_id IN (
      SELECT id FROM public.conversations WHERE contact_id = NEW.id
    );

    -- 2. Inserir as novas labels (tags) para todas as conversas deste contato
    -- NEW.tags é um JSONB array de UUIDs de labels (etiquetas), ex: '["uuid1", "uuid2"]'
    -- Convertemos o array JSONB em linhas e inserimos na tabela conversation_labels
    IF NEW.tags IS NOT NULL AND jsonb_array_length(NEW.tags) > 0 THEN
      INSERT INTO public.conversation_labels (conversation_id, label_id)
      SELECT c.id, (tag.value->>0)::uuid
      FROM public.conversations c
      CROSS JOIN jsonb_array_elements(NEW.tags) AS tag
      WHERE c.contact_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_contact_tags ON public.contacts;
CREATE TRIGGER trigger_sync_contact_tags
AFTER INSERT OR UPDATE OF tags ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION sync_contact_tags_to_conversation_labels();
        `;
        
        await client.query(sql);
        console.log("SQL do trigger executado com sucesso!");
        
        await client.end();
    } catch (e) {
        console.error("Erro executando SQL:", e);
    }
})();
