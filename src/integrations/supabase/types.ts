export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after_state: Json | null
          before_state: Json | null
          catalog_version_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          owner_id: string | null
          reason: string | null
          sport_space_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          catalog_version_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          owner_id?: string | null
          reason?: string | null
          sport_space_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          catalog_version_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          owner_id?: string | null
          reason?: string | null
          sport_space_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_catalog_version_id_fkey"
            columns: ["catalog_version_id"]
            isOneToOne: false
            referencedRelation: "catalog_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_sport_space_id_fkey"
            columns: ["sport_space_id"]
            isOneToOne: false
            referencedRelation: "sport_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_version_metrics: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          metric_id: string
          sort_order: number
          version_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          metric_id: string
          sort_order?: number
          version_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          metric_id?: string
          sort_order?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_version_metrics_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_version_metrics_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalog_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_versions: {
        Row: {
          catalog_id: string
          change_reason: string | null
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          published_by: string | null
          status: Database["public"]["Enums"]["catalog_version_status"]
          updated_at: string
          version_number: number
        }
        Insert: {
          catalog_id: string
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["catalog_version_status"]
          updated_at?: string
          version_number: number
        }
        Update: {
          catalog_id?: string
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["catalog_version_status"]
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_versions_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "metric_catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          season_id: string | null
          sport_space_id: string | null
          status: Database["public"]["Enums"]["entity_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          season_id?: string | null
          sport_space_id?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          season_id?: string | null
          sport_space_id?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
        }
        Relationships: [
          {
            foreignKeyName: "competitions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_sport_space_id_fkey"
            columns: ["sport_space_id"]
            isOneToOne: false
            referencedRelation: "sport_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      event_types: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          sport_id: string
          status: Database["public"]["Enums"]["entity_status"]
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          sport_id: string
          status?: Database["public"]["Enums"]["entity_status"]
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          sport_id?: string
          status?: Database["public"]["Enums"]["entity_status"]
        }
        Relationships: [
          {
            foreignKeyName: "event_types_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_catalogs: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string | null
          sport_id: string
          sport_space_id: string | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id?: string | null
          sport_id: string
          sport_space_id?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          sport_id?: string
          sport_space_id?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "metric_catalogs_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_catalogs_sport_space_id_fkey"
            columns: ["sport_space_id"]
            isOneToOne: false
            referencedRelation: "sport_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_formulas: {
        Row: {
          ast: Json
          created_at: string
          dependencies: string[]
          expression: string
          id: string
          metric_id: string
          null_policy: string
          version_id: string
        }
        Insert: {
          ast: Json
          created_at?: string
          dependencies?: string[]
          expression: string
          id?: string
          metric_id: string
          null_policy?: string
          version_id: string
        }
        Update: {
          ast?: Json
          created_at?: string
          dependencies?: string[]
          expression?: string
          id?: string
          metric_id?: string
          null_policy?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metric_formulas_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_formulas_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalog_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_groups: {
        Row: {
          catalog_id: string
          code: string
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          sort_order: number
          status: Database["public"]["Enums"]["entity_status"]
        }
        Insert: {
          catalog_id: string
          code: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
          status?: Database["public"]["Enums"]["entity_status"]
        }
        Update: {
          catalog_id?: string
          code?: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["entity_status"]
        }
        Relationships: [
          {
            foreignKeyName: "metric_groups_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "metric_catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_values: {
        Row: {
          bool_value: boolean | null
          context_id: string
          id: string
          metric_id: string
          numeric_value: number | null
          owner_id: string
          recorded_at: string
          recorded_by: string | null
          source: Database["public"]["Enums"]["data_source"]
          sport_space_id: string | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
        }
        Insert: {
          bool_value?: boolean | null
          context_id: string
          id?: string
          metric_id: string
          numeric_value?: number | null
          owner_id: string
          recorded_at?: string
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          sport_space_id?: string | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
        }
        Update: {
          bool_value?: boolean | null
          context_id?: string
          id?: string
          metric_id?: string
          numeric_value?: number | null
          owner_id?: string
          recorded_at?: string
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          sport_space_id?: string | null
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["subject_type"]
        }
        Relationships: [
          {
            foreignKeyName: "metric_values_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "observation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_values_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_values_sport_space_id_fkey"
            columns: ["sport_space_id"]
            isOneToOne: false
            referencedRelation: "sport_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_weights: {
        Row: {
          competition_id: string | null
          created_at: string
          id: string
          metric_id: string
          profile_id: string
          scope_extra: Json
          season_id: string | null
          sign: number
          version_id: string
          weight: number
        }
        Insert: {
          competition_id?: string | null
          created_at?: string
          id?: string
          metric_id: string
          profile_id: string
          scope_extra?: Json
          season_id?: string | null
          sign?: number
          version_id: string
          weight?: number
        }
        Update: {
          competition_id?: string | null
          created_at?: string
          id?: string
          metric_id?: string
          profile_id?: string
          scope_extra?: Json
          season_id?: string | null
          sign?: number
          version_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "metric_weights_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_weights_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_weights_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "valuation_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_weights_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_weights_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalog_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      metrics: {
        Row: {
          catalog_id: string
          code: string
          color: string | null
          created_at: string
          direction: Database["public"]["Enums"]["metric_direction"]
          group_id: string | null
          icon: string | null
          id: string
          name: string
          nature: Database["public"]["Enums"]["metric_nature"]
          scope: Database["public"]["Enums"]["subject_scope"]
          short_description: string | null
          status: Database["public"]["Enums"]["entity_status"]
          technical_description: string | null
          unit: string | null
          updated_at: string
          value_type: Database["public"]["Enums"]["metric_value_type"]
        }
        Insert: {
          catalog_id: string
          code: string
          color?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["metric_direction"]
          group_id?: string | null
          icon?: string | null
          id?: string
          name: string
          nature: Database["public"]["Enums"]["metric_nature"]
          scope?: Database["public"]["Enums"]["subject_scope"]
          short_description?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          technical_description?: string | null
          unit?: string | null
          updated_at?: string
          value_type: Database["public"]["Enums"]["metric_value_type"]
        }
        Update: {
          catalog_id?: string
          code?: string
          color?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["metric_direction"]
          group_id?: string | null
          icon?: string | null
          id?: string
          name?: string
          nature?: Database["public"]["Enums"]["metric_nature"]
          scope?: Database["public"]["Enums"]["subject_scope"]
          short_description?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          technical_description?: string | null
          unit?: string | null
          updated_at?: string
          value_type?: Database["public"]["Enums"]["metric_value_type"]
        }
        Relationships: [
          {
            foreignKeyName: "metrics_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "metric_catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metrics_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "metric_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      observation_contexts: {
        Row: {
          catalog_version_id: string | null
          competition_id: string | null
          created_at: string
          event_type_id: string
          id: string
          label: string | null
          notes: string | null
          occurred_at: string
          owner_id: string
          season_id: string | null
          sport_space_id: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          catalog_version_id?: string | null
          competition_id?: string | null
          created_at?: string
          event_type_id: string
          id?: string
          label?: string | null
          notes?: string | null
          occurred_at?: string
          owner_id: string
          season_id?: string | null
          sport_space_id?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          catalog_version_id?: string | null
          competition_id?: string | null
          created_at?: string
          event_type_id?: string
          id?: string
          label?: string | null
          notes?: string | null
          occurred_at?: string
          owner_id?: string
          season_id?: string | null
          sport_space_id?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "observation_contexts_catalog_version_id_fkey"
            columns: ["catalog_version_id"]
            isOneToOne: false
            referencedRelation: "catalog_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_contexts_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_contexts_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_contexts_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_contexts_sport_space_id_fkey"
            columns: ["sport_space_id"]
            isOneToOne: false
            referencedRelation: "sport_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_contexts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          birth_date: string | null
          created_at: string
          full_name: string
          id: string
          owner_id: string
          sport_space_id: string | null
          status: Database["public"]["Enums"]["entity_status"]
          team_id: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          full_name: string
          id?: string
          owner_id: string
          sport_space_id?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          full_name?: string
          id?: string
          owner_id?: string
          sport_space_id?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_sport_space_id_fkey"
            columns: ["sport_space_id"]
            isOneToOne: false
            referencedRelation: "sport_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          locale: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          locale?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      seasons: {
        Row: {
          created_at: string
          ends_on: string | null
          id: string
          name: string
          owner_id: string
          sport_space_id: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          name: string
          owner_id: string
          sport_space_id?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          name?: string
          owner_id?: string
          sport_space_id?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_sport_space_id_fkey"
            columns: ["sport_space_id"]
            isOneToOne: false
            referencedRelation: "sport_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_space_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["sport_space_role"]
          sport_space_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["sport_space_role"]
          sport_space_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["sport_space_role"]
          sport_space_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_space_members_sport_space_id_fkey"
            columns: ["sport_space_id"]
            isOneToOne: false
            referencedRelation: "sport_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_spaces: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["entity_status"]
          type: Database["public"]["Enums"]["sport_space_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          status?: Database["public"]["Enums"]["entity_status"]
          type?: Database["public"]["Enums"]["sport_space_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["entity_status"]
          type?: Database["public"]["Enums"]["sport_space_type"]
          updated_at?: string
        }
        Relationships: []
      }
      sports: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          owner_id: string | null
          sport_space_id: string | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          owner_id?: string | null
          sport_space_id?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string | null
          sport_space_id?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sports_sport_space_id_fkey"
            columns: ["sport_space_id"]
            isOneToOne: false
            referencedRelation: "sport_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          category: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          sport_id: string
          sport_space_id: string | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          sport_id: string
          sport_space_id?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          sport_id?: string
          sport_space_id?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_sport_space_id_fkey"
            columns: ["sport_space_id"]
            isOneToOne: false
            referencedRelation: "sport_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      validation_rules: {
        Row: {
          created_at: string
          id: string
          message: string | null
          metric_id: string
          params: Json
          rule_type: string
          version_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          metric_id: string
          params?: Json
          rule_type: string
          version_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          metric_id?: string
          params?: Json
          rule_type?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_rules_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_rules_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalog_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      valuation_profiles: {
        Row: {
          algorithm: string
          catalog_id: string
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["entity_status"]
        }
        Insert: {
          algorithm?: string
          catalog_id: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["entity_status"]
        }
        Update: {
          algorithm?: string
          catalog_id?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["entity_status"]
        }
        Relationships: [
          {
            foreignKeyName: "valuation_profiles_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "metric_catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      valuations: {
        Row: {
          algorithm: string
          breakdown: Json
          calculated_at: string
          calculated_by: string | null
          catalog_version_id: string
          competition_id: string | null
          context_id: string | null
          id: string
          owner_id: string
          profile_id: string
          score: number
          season_id: string | null
          sport_space_id: string | null
          status: Database["public"]["Enums"]["valuation_status"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          superseded_by: string | null
          weights_snapshot: Json
        }
        Insert: {
          algorithm: string
          breakdown?: Json
          calculated_at?: string
          calculated_by?: string | null
          catalog_version_id: string
          competition_id?: string | null
          context_id?: string | null
          id?: string
          owner_id: string
          profile_id: string
          score: number
          season_id?: string | null
          sport_space_id?: string | null
          status?: Database["public"]["Enums"]["valuation_status"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["subject_type"]
          superseded_by?: string | null
          weights_snapshot?: Json
        }
        Update: {
          algorithm?: string
          breakdown?: Json
          calculated_at?: string
          calculated_by?: string | null
          catalog_version_id?: string
          competition_id?: string | null
          context_id?: string | null
          id?: string
          owner_id?: string
          profile_id?: string
          score?: number
          season_id?: string | null
          sport_space_id?: string | null
          status?: Database["public"]["Enums"]["valuation_status"]
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["subject_type"]
          superseded_by?: string | null
          weights_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "valuations_catalog_version_id_fkey"
            columns: ["catalog_version_id"]
            isOneToOne: false
            referencedRelation: "catalog_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuations_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuations_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "observation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "valuation_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuations_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuations_sport_space_id_fkey"
            columns: ["sport_space_id"]
            isOneToOne: false
            referencedRelation: "sport_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuations_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "valuations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_bootstrap_sport_space_membership: {
        Args: { _sport_space_id: string }
        Returns: boolean
      }
      can_read_catalog: { Args: { _catalog_id: string }; Returns: boolean }
      can_read_metric: { Args: { _metric_id: string }; Returns: boolean }
      can_read_valuation_profile: {
        Args: { _profile_id: string }
        Returns: boolean
      }
      can_read_version: { Args: { _version_id: string }; Returns: boolean }
      can_use_sport: { Args: { _sport_id: string }; Returns: boolean }
      can_write_catalog: { Args: { _catalog_id: string }; Returns: boolean }
      ensure_personal_sport_space: {
        Args: { _user_id: string }
        Returns: string
      }
      ensure_sport_space_owner: {
        Args: { _sport_space_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_sport_space_member: {
        Args: { _sport_space_id: string }
        Returns: boolean
      }
      is_sport_space_owner: {
        Args: { _sport_space_id: string }
        Returns: boolean
      }
      owns_competition: { Args: { _competition_id: string }; Returns: boolean }
      owns_context: { Args: { _context_id: string }; Returns: boolean }
      owns_player: { Args: { _player_id: string }; Returns: boolean }
      owns_season: { Args: { _season_id: string }; Returns: boolean }
      owns_subject: {
        Args: {
          _subject_id: string
          _subject_type: Database["public"]["Enums"]["subject_type"]
        }
        Returns: boolean
      }
      owns_team: { Args: { _team_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "coach"
      catalog_version_status: "draft" | "published" | "retired"
      data_source: "manual" | "imported" | "ai"
      entity_status: "active" | "inactive" | "archived"
      metric_direction: "higher_is_better" | "lower_is_better" | "neutral"
      metric_nature: "primary" | "derived"
      metric_value_type: "counter" | "duration" | "boolean" | "ratio" | "scale"
      sport_space_role: "owner" | "coach"
      sport_space_type:
        | "club"
        | "federation"
        | "academy"
        | "personal"
        | "company"
        | "other"
      subject_scope: "individual" | "collective"
      subject_type: "player" | "team"
      valuation_status: "current" | "superseded"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "coach"],
      catalog_version_status: ["draft", "published", "retired"],
      data_source: ["manual", "imported", "ai"],
      entity_status: ["active", "inactive", "archived"],
      metric_direction: ["higher_is_better", "lower_is_better", "neutral"],
      metric_nature: ["primary", "derived"],
      metric_value_type: ["counter", "duration", "boolean", "ratio", "scale"],
      sport_space_role: ["owner", "coach"],
      sport_space_type: [
        "club",
        "federation",
        "academy",
        "personal",
        "company",
        "other",
      ],
      subject_scope: ["individual", "collective"],
      subject_type: ["player", "team"],
      valuation_status: ["current", "superseded"],
    },
  },
} as const
