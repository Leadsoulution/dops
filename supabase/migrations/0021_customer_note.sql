-- Note du client sur la commande, par exemple "livrer apres 19H".
--
-- Cette note part chez le transporteur dans le champ COMMENT du colis,
-- au moment de sa creation. ForceLog n'offrant aucun moyen de modifier
-- un colis existant, une note ajoutee apres l'expedition reste dans
-- l'application sans atteindre le livreur.
alter table leads add column if not exists customer_note text;
