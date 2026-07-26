ALTER TABLE admin_settings
ALTER COLUMN eur_to_czk_rate DROP DEFAULT;

ALTER TABLE admin_settings
ALTER COLUMN eur_to_czk_rate DROP NOT NULL;
