DO $$
DECLARE
  space_ids uuid[];
  sport_ids uuid[];
  catalog_ids uuid[];
  version_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO space_ids FROM public.sport_spaces WHERE slug LIKE 'f0042-%';
  IF space_ids IS NULL THEN RETURN; END IF;

  SELECT array_agg(id) INTO sport_ids FROM public.sports WHERE sport_space_id = ANY(space_ids);
  SELECT array_agg(id) INTO catalog_ids FROM public.metric_catalogs WHERE sport_space_id = ANY(space_ids);
  SELECT array_agg(id) INTO version_ids FROM public.catalog_versions WHERE catalog_id = ANY(COALESCE(catalog_ids, ARRAY[]::uuid[]));

  ALTER TABLE public.audit_log DISABLE TRIGGER audit_no_delete;
  ALTER TABLE public.valuations DISABLE TRIGGER valuations_no_delete;
  ALTER TABLE public.catalog_versions DISABLE TRIGGER catalog_versions_no_delete;
  ALTER TABLE public.metrics DISABLE TRIGGER metrics_no_delete;
  ALTER TABLE public.sport_spaces DISABLE TRIGGER sport_spaces_forbid_delete;
  ALTER TABLE public.sport_space_members DISABLE TRIGGER sport_space_members_last_owner_delete;
  ALTER TABLE public.metric_weights DISABLE TRIGGER weights_draft_only;
  ALTER TABLE public.metric_formulas DISABLE TRIGGER formulas_draft_only;
  ALTER TABLE public.validation_rules DISABLE TRIGGER rules_draft_only;
  ALTER TABLE public.catalog_version_metrics DISABLE TRIGGER cvm_draft_only;
  ALTER TABLE public.metric_values DISABLE TRIGGER metric_values_primary_only;

  DELETE FROM public.audit_log WHERE sport_space_id = ANY(space_ids);
  DELETE FROM public.valuations WHERE sport_space_id = ANY(space_ids);
  DELETE FROM public.metric_values WHERE sport_space_id = ANY(space_ids);
  DELETE FROM public.observation_contexts WHERE sport_space_id = ANY(space_ids);

  IF version_ids IS NOT NULL THEN
    DELETE FROM public.metric_weights WHERE version_id = ANY(version_ids);
    DELETE FROM public.metric_formulas WHERE version_id = ANY(version_ids);
    DELETE FROM public.validation_rules WHERE version_id = ANY(version_ids);
    DELETE FROM public.catalog_version_metrics WHERE version_id = ANY(version_ids);
  END IF;
  IF catalog_ids IS NOT NULL THEN
    DELETE FROM public.valuation_profiles WHERE catalog_id = ANY(catalog_ids);
    DELETE FROM public.catalog_versions WHERE catalog_id = ANY(catalog_ids);
    DELETE FROM public.metrics WHERE catalog_id = ANY(catalog_ids);
    DELETE FROM public.metric_groups WHERE catalog_id = ANY(catalog_ids);
    DELETE FROM public.metric_catalogs WHERE id = ANY(catalog_ids);
  END IF;

  DELETE FROM public.players WHERE sport_space_id = ANY(space_ids);
  DELETE FROM public.teams WHERE sport_space_id = ANY(space_ids);
  DELETE FROM public.competitions WHERE sport_space_id = ANY(space_ids);
  DELETE FROM public.seasons WHERE sport_space_id = ANY(space_ids);
  DELETE FROM public.sport_categories WHERE sport_space_id = ANY(space_ids);

  IF sport_ids IS NOT NULL THEN
    DELETE FROM public.event_types WHERE sport_id = ANY(sport_ids);
    DELETE FROM public.sports WHERE id = ANY(sport_ids);
  END IF;

  DELETE FROM public.sport_space_members WHERE sport_space_id = ANY(space_ids);
  DELETE FROM public.sport_spaces WHERE id = ANY(space_ids);

  ALTER TABLE public.audit_log ENABLE TRIGGER audit_no_delete;
  ALTER TABLE public.valuations ENABLE TRIGGER valuations_no_delete;
  ALTER TABLE public.catalog_versions ENABLE TRIGGER catalog_versions_no_delete;
  ALTER TABLE public.metrics ENABLE TRIGGER metrics_no_delete;
  ALTER TABLE public.sport_spaces ENABLE TRIGGER sport_spaces_forbid_delete;
  ALTER TABLE public.sport_space_members ENABLE TRIGGER sport_space_members_last_owner_delete;
  ALTER TABLE public.metric_weights ENABLE TRIGGER weights_draft_only;
  ALTER TABLE public.metric_formulas ENABLE TRIGGER formulas_draft_only;
  ALTER TABLE public.validation_rules ENABLE TRIGGER rules_draft_only;
  ALTER TABLE public.catalog_version_metrics ENABLE TRIGGER cvm_draft_only;
  ALTER TABLE public.metric_values ENABLE TRIGGER metric_values_primary_only;
END $$;