-- GraphNode en GraphEdge hadden nooit een foreign key naar User, in
-- tegenstelling tot elke andere tabel met een user_id-kolom (zie de
-- AddForeignKey-blokken in 20260805195932_init). Ze stonden dus al wel achter
-- RLS (20260805205044_enable_rls), maar een verwijderde User liet zijn
-- graafknopen en -randen als wezen achter.
--
-- Dat wordt zichtbaar zodra account verwijderen bestaat: die verwijdert
-- alléén de User-rij en leunt op ON DELETE CASCADE om de rest mee te nemen
-- (zie deleteAccount() in src/lib/actions.ts). Zonder deze constraint blijven
-- GraphNode/GraphEdge achter — geen foutmelding, gewoon data van een
-- niet-bestaande gebruiker die nergens meer bij hoort.
ALTER TABLE "GraphNode" ADD CONSTRAINT "GraphNode_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GraphEdge" ADD CONSTRAINT "GraphEdge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
