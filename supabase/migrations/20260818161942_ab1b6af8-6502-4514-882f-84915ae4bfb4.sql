DO $$
DECLARE
  v_spaces uuid[] := ARRAY['63fe7ce7-cb34-412e-91d1-0a87b3579b92'::uuid,'f203d9cf-f7de-4908-b1de-142f7c96ad97'::uuid];
  v_catalogs uuid[];
  v_versions uuid[];
  v_sports uuid[];
BEGIN
  IF (SELECT count(*) FROM public.sport_spaces WHERE id = ANY(v_spaces) AND name LIKE 'VAL005\_%') <> 2 THEN
    RAISE NOTICE 'Nada que purgar: los SportSpaces VAL005 no existen';
    RETURN;
  END IF;

  SELECT array_agg(id) INTO v_sports FROM public.sports WHERE sport_space_id = ANY(v_spaces);
  SELECT array_agg(id) INTO v_catalogs FROM public.metric_catalogs WHERE sport_space_id = ANY(v_spaces);
  SELECT array_agg(id) INTO v_versions FROM public.catalog_versions WHERE catalog_id = ANY(coalesce(v_catalogs,'{}'::uuid[]));

  ALTER TABLE public.valuations DISABLE TRIGGER valuations_no_delete;
  ALTER TABLE public.catalog_versions DISABLE TRIGGER catalog_versions_no_delete;
  ALTER TABLE public.metrics DISABLE TRIGGER metrics_no_delete;
  ALTER TABLE public.sport_spaces DISABLE TRIGGER sport_spaces_forbid_delete;
  ALTER TABLE public.audit_log DISABLE TRIGGER audit_no_delete;
  ALTER TABLE public.metric_weights DISABLE TRIGGER weights_draft_only;
  ALTER TABLE public.metric_formulas DISABLE TRIGGER formulas_draft_only;
  ALTER TABLE public.validation_rules DISABLE TRIGGER rules_draft_only;
  ALTER TABLE public.catalog_version_metrics DISABLE TRIGGER cvm_draft_only;
  ALTER TABLE public.starter_pack_installation_events DISABLE TRIGGER starter_pack_events_forbid_delete;
  ALTER TABLE public.sport_space_members DISABLE TRIGGER sport_space_members_last_owner_delete;

  DELETE FROM public.valuations WHERE sport_space_id = ANY(v_spaces);
  DELETE FROM public.metric_values WHERE sport_space_id = ANY(v_spaces);
  DELETE FROM public.observation_contexts WHERE sport_space_id = ANY(v_spaces);
  DELETE FROM public.metric_weights WHERE version_id = ANY(coalesce(v_versions,'{}'::uuid[]));
  DELETE FROM public.metric_formulas WHERE version_id = ANY(coalesce(v_versions,'{}'::uuid[]));
  DELETE FROM public.validation_rules WHERE version_id = ANY(coalesce(v_versions,'{}'::uuid[]));
  DELETE FROM public.catalog_version_metrics WHERE version_id = ANY(coalesce(v_versions,'{}'::uuid[]));
  DELETE FROM public.starter_pack_installation_events WHERE sport_space_id = ANY(v_spaces);
  DELETE FROM public.starter_pack_installations WHERE sport_space_id = ANY(v_spaces);
  DELETE FROM public.valuation_profiles WHERE catalog_id = ANY(coalesce(v_catalogs,'{}'::uuid[]));
  DELETE FROM public.catalog_versions WHERE catalog_id = ANY(coalesce(v_catalogs,'{}'::uuid[]));
  DELETE FROM public.metrics WHERE catalog_id = ANY(coalesce(v_catalogs,'{}'::uuid[]));
  DELETE FROM public.metric_groups WHERE catalog_id = ANY(coalesce(v_catalogs,'{}'::uuid[]));
  DELETE FROM public.metric_catalogs WHERE sport_space_id = ANY(v_spaces);
  DELETE FROM public.event_types WHERE sport_id = ANY(coalesce(v_sports,'{}'::uuid[]));
  DELETE FROM public.players WHERE sport_space_id = ANY(v_spaces);
  DELETE FROM public.teams WHERE sport_space_id = ANY(v_spaces);
  DELETE FROM public.competitions WHERE sport_space_id = ANY(v_spaces);
  DELETE FROM public.seasons WHERE sport_space_id = ANY(v_spaces);
  DELETE FROM public.sport_categories WHERE sport_space_id = ANY(v_spaces);
  DELETE FROM public.sports WHERE id = ANY(coalesce(v_sports,'{}'::uuid[]));
  DELETE FROM public.audit_log WHERE sport_space_id = ANY(v_spaces);
  DELETE FROM public.sport_space_members WHERE sport_space_id = ANY(v_spaces);
  DELETE FROM public.sport_spaces WHERE id = ANY(v_spaces);

  ALTER TABLE public.valuations ENABLE TRIGGER valuations_no_delete;
  ALTER TABLE public.catalog_versions ENABLE TRIGGER catalog_versions_no_delete;
  ALTER TABLE public.metrics ENABLE TRIGGER metrics_no_delete;
  ALTER TABLE public.sport_spaces ENABLE TRIGGER sport_spaces_forbid_delete;
  ALTER TABLE public.audit_log ENABLE TRIGGER audit_no_delete;
  ALTER TABLE public.metric_weights ENABLE TRIGGER weights_draft_only;
  ALTER TABLE public.metric_formulas ENABLE TRIGGER formulas_draft_only;
  ALTER TABLE public.validation_rules ENABLE TRIGGER rules_draft_only;
  ALTER TABLE public.catalog_version_metrics ENABLE TRIGGER cvm_draft_only;
  ALTER TABLE public.starter_pack_installation_events ENABLE TRIGGER starter_pack_events_forbid_delete;
  ALTER TABLE public.sport_space_members ENABLE TRIGGER sport_space_members_last_owner_delete;
END $$;