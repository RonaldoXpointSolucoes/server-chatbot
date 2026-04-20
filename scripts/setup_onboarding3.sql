CREATE OR REPLACE FUNCTION setup_new_whatsapp_instance()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.settings IS NULL OR NEW.settings::text = '{}' OR NEW.settings::text = '""' THEN
        NEW.settings = jsonb_build_object(
            'reject_calls', false,
            'ignore_groups', false,
            'always_online', true,
            'sync_history', false,
            'read_messages', false
        );
    END IF;

    IF NEW.status IS NULL OR NEW.status = '' THEN
        NEW.status = 'offline';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
