CREATE TABLE personal_wallet_options (
  wallet_id text PRIMARY KEY REFERENCES personal_wallets(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exclude_from_reports integer NOT NULL DEFAULT 0,
  enable_notification integer NOT NULL DEFAULT 0,
  linked_bank_code text,
  updated_at text NOT NULL
);

CREATE INDEX personal_wallet_options_user_id_idx
  ON personal_wallet_options(user_id);
