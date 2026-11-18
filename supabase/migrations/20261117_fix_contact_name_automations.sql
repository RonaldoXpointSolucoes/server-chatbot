-- Migration: Fix extract_contact_name overwriting real contacts with outgoing/PIX names (ex: LOCASERV)
-- Date: 2026-11-17
-- Root causes fixed:
--   1. public.apply_message_automations() ran on ANY message (including outbound human/bot PIX instructions)
--      and used `(custom_name IS NULL OR custom_name = '' OR name = phone)` with OR instead of AND,
--      overwriting contacts that already had valid WhatsApp pushNames or manual names.
--   2. public.protect_custom_contact_name() treated empty string custom_name as non-null and blocked
--      clearing known corrupted automation values like LOCASERV.
--   3. public.fn_sync_contact_name_from_holding() could propagate placeholders or run during manual resets.

-- 1) Harden protect_custom_contact_name()
CREATE OR REPLACE FUNCTION public.protect_custom_contact_name()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_old_custom TEXT;
    v_new_custom TEXT;
    v_allow_clear BOOLEAN;
BEGIN
    v_old_custom := NULLIF(btrim(COALESCE(OLD.custom_name, '')), '');
    v_new_custom := NULLIF(btrim(COALESCE(NEW.custom_name, '')), '');
    v_allow_clear := COALESCE(current_setting('app.allow_clear_custom_name', true), '') = 'true';

    -- Normaliza string vazia para NULL para nunca apagar NEW.name com ''
    NEW.custom_name := v_new_custom;

    -- Permite limpar custom_name se explicitamente autorizado ou se o valor antigo for corrompido/placeholder
    IF v_new_custom IS NULL AND v_old_custom IS NOT NULL THEN
        IF v_allow_clear OR lower(v_old_custom) ~ '(locaserv|chave\s*pix|nosso\s*pix|novo\s*contato|contato\s*desconhecido|contato\s*sem\s*telefone|contato\s*sem\s*nome|^contato$|^sem\s*nome$|^empresa$|^null$|^undefined$)' THEN
            RETURN NEW;
        END IF;
        NEW.custom_name := v_old_custom;
        NEW.name := v_old_custom;
        RETURN NEW;
    END IF;

    -- Se o update incluir um custom_name válido, sincroniza "name" com ele
    IF v_new_custom IS NOT NULL THEN
        NEW.name := v_new_custom;
    END IF;

    RETURN NEW;
END;
$function$;

-- 2) Harden apply_message_automations()
CREATE OR REPLACE FUNCTION public.apply_message_automations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    rule_record RECORD;
    pattern_text TEXT;
    extracted_name TEXT;
    contact_id UUID;
    matches TEXT[];
    v_tenant_name TEXT;
BEGIN
    FOR rule_record IN
        SELECT condition_text, action_type
        FROM public.tenant_automations
        WHERE tenant_id = NEW.tenant_id AND is_active = true
    LOOP
        IF rule_record.action_type IN ('ignore_message', 'ignore') THEN
            pattern_text := replace(rule_record.condition_text, '(X)', '%');

            IF NEW.text_content ILIKE '%' || pattern_text || '%' THEN
                UPDATE public.conversations
                SET unread_count = 0
                WHERE id = NEW.conversation_id;

                EXIT;
            END IF;

        ELSIF rule_record.action_type = 'extract_contact_name' THEN
            -- REGRA 1: Somente mensagens recebidas do CLIENTE (nunca mensagens enviadas por atendentes, bot ou automações)
            IF NEW.sender_type IS DISTINCT FROM 'client'
               OR COALESCE(lower(btrim(NEW.direction)), 'inbound') NOT IN ('inbound', 'incoming') THEN
                CONTINUE;
            END IF;

            -- REGRA 2: Bloqueia blocos de PIX / dados bancários / payload EMV (evita capturar "Nome: LOCASERV...")
            IF NEW.text_content IS NULL
               OR NEW.text_content ~* '(nosso\s+pix|chave\s+pix|copia\s+e\s+cola|br\.gov\.bcb\.pix|00020101|nome\s*[:=]\s*locaserv)' THEN
                CONTINUE;
            END IF;

            pattern_text := replace(
                replace(
                    replace(rule_record.condition_text, '.', '\.'),
                    '*', '\*'
                ),
                '(X)', '\s*([^\r\n]+)'
            );

            matches := regexp_match(NEW.text_content, pattern_text, 'i');

            IF matches IS NOT NULL AND array_length(matches, 1) > 0 THEN
                extracted_name := btrim(matches[1]);

                -- Exige tamanho razoável e ao menos uma letra (não aceita número puro/pontuação)
                IF length(extracted_name) >= 2
                   AND length(extracted_name) < 100
                   AND extracted_name ~ '[A-Za-zÀ-ÿ]' THEN

                    -- REGRA 3: Bloqueia nomes genéricos/placeholder e PIX/Locaserv
                    IF lower(extracted_name) ~ '(locaserv|chave\s*pix|nosso\s*pix|novo\s*contato|contato\s*desconhecido|contato\s*sem\s*telefone|contato\s*sem\s*nome|^contato$|^sem\s*nome$|^empresa$|^cliente$|^desconhecido$|^null$|^undefined$)' THEN
                        CONTINUE;
                    END IF;

                    -- REGRA 4: Bloqueia o próprio nome do tenant ou nomes das caixas de WhatsApp do tenant
                    SELECT name INTO v_tenant_name FROM public.tenants WHERE id = NEW.tenant_id;
                    IF v_tenant_name IS NOT NULL AND (
                        lower(extracted_name) = lower(btrim(v_tenant_name))
                        OR replace(lower(extracted_name), ' ', '') = replace(lower(btrim(v_tenant_name)), ' ', '')
                    ) THEN
                        CONTINUE;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM public.whatsapp_instances wi
                        WHERE wi.tenant_id = NEW.tenant_id
                          AND wi.display_name IS NOT NULL
                          AND lower(btrim(wi.display_name)) = lower(extracted_name)
                    ) THEN
                        CONTINUE;
                    END IF;

                    SELECT c.contact_id INTO contact_id
                    FROM public.conversations c
                    WHERE c.id = NEW.conversation_id;

                    IF contact_id IS NOT NULL THEN
                        -- REGRA 5 (AND estrito!): Só preenche "name" (sem forçar custom_name) quando o contato
                        -- NÃO possui custom_name E ainda está sem nome ou apenas com o número de telefone.
                        UPDATE public.contacts
                        SET name = extracted_name,
                            custom_name = CASE WHEN btrim(COALESCE(custom_name, '')) = '' THEN NULL ELSE custom_name END
                        WHERE id = contact_id
                          AND NULLIF(btrim(COALESCE(custom_name, '')), '') IS NULL
                          AND (
                              name IS NULL
                              OR btrim(name) = ''
                              OR btrim(name) = btrim(COALESCE(phone, ''))
                              OR (
                                  btrim(name) ~ '^[\d\s\(\)\+\-\.]+$'
                                  AND length(regexp_replace(name, '\D', '', 'g')) >= 4
                                  AND (
                                      regexp_replace(name, '\D', '', 'g') = regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
                                      OR (
                                          length(regexp_replace(COALESCE(phone, ''), '\D', '', 'g')) >= 8
                                          AND right(regexp_replace(name, '\D', '', 'g'), 8) = right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 8)
                                      )
                                  )
                              )
                              OR lower(btrim(name)) IN (
                                  'novo contato', 'contato desconhecido', 'contato sem telefone',
                                  'contato sem nome', 'contato', 'sem nome', 'empresa', 'cliente', 'null', 'undefined'
                              )
                              OR lower(btrim(name)) LIKE '%locaserv%'
                          );
                    END IF;
                END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

-- 3) Harden fn_sync_contact_name_from_holding() to normalize blank/placeholder names to phone
--    and only copy valid person/company names on INSERT (not fighting manual updates or spreading LOCASERV)
CREATE OR REPLACE FUNCTION public.fn_sync_contact_name_from_holding()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_holding_id UUID;
    v_real_name TEXT;
    v_clean_phone TEXT;
BEGIN
    v_clean_phone := NULLIF(btrim(COALESCE(NEW.phone, '')), '');

    -- Garante fallback estrito para o número quando não foi possível obter o nome
    IF NEW.name IS NULL
       OR btrim(NEW.name) = ''
       OR lower(btrim(NEW.name)) IN (
           'null', 'undefined', 'sem nome', 'novo contato', 'contato desconhecido',
           'contato sem telefone', 'contato sem nome', 'contato', 'empresa', 'cliente', 'desconhecido'
       ) THEN
        IF v_clean_phone IS NOT NULL THEN
            NEW.name := v_clean_phone;
        END IF;
    END IF;

    IF TG_OP = 'INSERT' AND v_clean_phone IS NOT NULL AND btrim(COALESCE(NEW.name, '')) = v_clean_phone THEN
        SELECT economic_group_id INTO v_holding_id
        FROM public.companies
        WHERE id = NEW.tenant_id;

        IF v_holding_id IS NOT NULL THEN
            SELECT c.name INTO v_real_name
            FROM public.contacts c
            JOIN public.companies comp ON c.tenant_id = comp.id
            WHERE c.phone = NEW.phone
              AND c.tenant_id != NEW.tenant_id
              AND c.name IS NOT NULL
              AND btrim(c.name) != ''
              AND btrim(c.name) != btrim(COALESCE(c.phone, ''))
              AND c.name ~ '[A-Za-zÀ-ÿ]'
              AND lower(btrim(c.name)) !~ '(locaserv|chave\s*pix|nosso\s*pix|novo\s*contato|contato\s*desconhecido|contato\s*sem|sem\s*nome|^contato$|^empresa$|^cliente$|^null$|^undefined$)'
              AND comp.economic_group_id = v_holding_id
            ORDER BY c.created_at DESC
            LIMIT 1;

            IF v_real_name IS NOT NULL THEN
                NEW.name := v_real_name;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- 4) Restaurar os 4 contatos atualmente corrompidos com "LOCASERV MARKETING E SERVICOS LTDA" no tenant Burguer Plus
UPDATE public.contacts
SET custom_name = 'Leina Ferreira',
    name = 'Leina Ferreira'
WHERE id = 'fa24c1e4-7ae2-47cf-a91f-93ad35351daf'
  AND tenant_id = '9057ca36-0b29-4fe5-89fb-be5e13387030'
  AND (name ILIKE '%LOCASERV%' OR custom_name ILIKE '%LOCASERV%');

UPDATE public.contacts
SET custom_name = 'Renata Silva',
    name = 'Renata Silva'
WHERE id = 'dc9aeaab-a47e-4480-8349-f0a64bcf62fb'
  AND tenant_id = '9057ca36-0b29-4fe5-89fb-be5e13387030'
  AND (name ILIKE '%LOCASERV%' OR custom_name ILIKE '%LOCASERV%');

UPDATE public.contacts
SET custom_name = NULL,
    name = 'Vini'
WHERE id = 'a0be2768-aac0-4ea1-b499-1997e37d3034'
  AND tenant_id = '9057ca36-0b29-4fe5-89fb-be5e13387030'
  AND (name ILIKE '%LOCASERV%' OR custom_name ILIKE '%LOCASERV%');

UPDATE public.contacts
SET custom_name = NULL,
    name = '551175960999'
WHERE id = 'd9f6f8f4-ae19-4857-b48d-6d6db2822ddc'
  AND tenant_id = '9057ca36-0b29-4fe5-89fb-be5e13387030'
  AND (name ILIKE '%LOCASERV%' OR custom_name ILIKE '%LOCASERV%');
