-- Truthful barcode provenance update for seeded MENA reference items until live verified GTIN import (KAN-116)
UPDATE `food_barcodes`
SET `provenance` = 'seeded_reference'
WHERE `provenance` = 'verified_brand'
  AND `submitted_by_user_id` IS NULL;
