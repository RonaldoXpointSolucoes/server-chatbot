-- Adds status to track blue ticks (read receipts)
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PENDING';

-- For existing messages, update null to SENT or READ to prevent errors
UPDATE messages
SET status = 'READ'
WHERE sender_type = 'human' AND status IS NULL;
