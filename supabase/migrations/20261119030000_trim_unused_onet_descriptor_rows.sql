-- ---------------------------------------------------------------------------
-- Reclaim database space by trimming O*NET descriptor rows the app never reads.
--
-- WHY
-- `reference_items` had grown to ~386 MB (≈77% of the 500 MB free-tier database),
-- and O*NET's rated-descriptor tables were the entire weight. A per-entity_type
-- audit showed ~316k rows, of which these three descriptor sets alone were ~68%:
--   occupation_ability           ~94.6k rows (~40 MB)
--   occupation_work_activity     ~74.7k rows (~33 MB)
--   occupation_transferable_skill ~45.5k rows (~19 MB)
--
-- Nothing in the app queries these three by entity_type. Requirement derivation
-- reads only occupation_skill + occupation_knowledge at scale IM
-- (src/lib/target-roles/repository.ts getOccupationAttributes); title search reads
-- only `occupation` (searchOccupations). The three sets fed one thing: the RAG
-- chunker's "Abilities" / "Work activities" sections and transferable-skill padding
-- of the "Skills" section (src/lib/rag/chunk.ts). That reference RAG store is barely
-- populated, so there is no live retrieval impact today.
--
-- For a career *evidence* agent these are the abstract layers: abilities are
-- enduring capacities you can't show a work artifact for; work activities duplicate
-- the concrete, retained `occupation_task`; transferable skills overlap the retained
-- essential skills and the SPF's foundational skills. The kept set
-- (occupation + occupation_skill + occupation_knowledge + occupation_task) plus the
-- Tech Fleet Skills & Practices Framework covers role selection, requirement
-- matching, and RAG grounding. See ADR-0008 (reference data) and ADR-0010 (RAG).
--
-- SAFETY
-- role_requirements.reference_item_id is `on delete set null`
-- (20261112020119_add_role_requirement_source_and_reference_search.sql), so any
-- saved requirement that pointed at a deleted row keeps its text and its `source`
-- label and simply loses the now-absent reference link. No orphans, no failed
-- delete. These rows are read-only reference data with no other dependents.
--
-- REVERSIBLE
-- This evicts rows from the database; it deletes no source data. The raw O*NET
-- files live in the git-ignored data/reference/onet/ folder, so a future feature
-- can restore any of these sets by re-running the reference importer. NOTE: a full
-- re-import would also re-insert these rows. To keep them out durably, also trim
-- ONET_TABLES in src/lib/reference/onet.ts and the matching ONET_SECTIONS in
-- src/lib/rag/chunk.ts (optional follow-up; not required for this space fix).
-- ---------------------------------------------------------------------------

-- 1) Drop the three descriptor sets the app never reads. Idempotent: a re-run
--    simply deletes nothing.
delete from public.reference_items
where source = 'onet'
  and entity_type in (
    'occupation_ability',
    'occupation_work_activity',
    'occupation_transferable_skill'
  );

-- 2) In the retained rated tables, O*NET stores two scales per element:
--    Importance (IM) and Level (LV). The app reads only IM
--    (getOccupationAttributes filters payload->>'scale_id' = 'IM'), and the RAG
--    chunker dedups element names regardless of scale, so every LV row is dead
--    weight. Drop them from the tables we keep.
delete from public.reference_items
where source = 'onet'
  and entity_type in ('occupation_skill', 'occupation_knowledge')
  and payload->>'scale_id' = 'LV';

-- ---------------------------------------------------------------------------
-- AFTER THIS MIGRATION APPLIES: reclaim the freed space.
--
-- DELETE marks rows dead but does not shrink the table files or their indexes on
-- disk, so the reported database size will not drop until a VACUUM FULL rewrites
-- them. VACUUM cannot run inside a migration transaction, so it is NOT included
-- here. Run this ONCE in the Supabase SQL Editor after this migration is applied:
--
--   vacuum (full, analyze) public.reference_items;
--
-- VACUUM FULL takes a brief exclusive lock on the table and needs temporary free
-- space to rewrite it; run it when the app is idle. After it completes, re-run the
-- size audit to confirm reference_items has dropped from ~386 MB to ~120 MB.
-- ---------------------------------------------------------------------------
