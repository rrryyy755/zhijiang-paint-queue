ALTER TABLE tickets ADD COLUMN phone_key TEXT;
CREATE UNIQUE INDEX tickets_phone_key_unique ON tickets(phone_key);
