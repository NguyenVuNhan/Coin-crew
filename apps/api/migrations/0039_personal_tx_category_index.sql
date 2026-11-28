-- #117: the repeat suggestion after each manual entry probes one wallet's category for a similar amount
-- around one date. This index lets that probe seek straight to similar amounts instead of scanning the window.
CREATE INDEX IF NOT EXISTS personal_tx_wallet_cat_amount_idx ON personal_transactions (wallet_id, category_id, amount, date);
