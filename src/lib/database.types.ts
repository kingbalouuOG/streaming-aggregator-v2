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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_feedback: {
        Row: {
          context: Json | null
          created_at: string | null
          id: string
          message: string
          rating: number | null
          user_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          id?: string
          message: string
          rating?: number | null
          user_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          id?: string
          message?: string
          rating?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_reports: {
        Row: {
          created_at: string | null
          id: string
          media_type: string
          notes: string | null
          report_type: string
          service_id: string | null
          tmdb_id: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          media_type: string
          notes?: string | null
          report_type: string
          service_id?: string | null
          tmdb_id: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          media_type?: string
          notes?: string | null
          report_type?: string
          service_id?: string | null
          tmdb_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      card_impression_daily_totals: {
        Row: {
          content_id: number
          date: string
          impression_count: number
          source_surface: string
          user_id: string
        }
        Insert: {
          content_id: number
          date: string
          impression_count: number
          source_surface: string
          user_id: string
        }
        Update: {
          content_id?: number
          date?: string
          impression_count?: number
          source_surface?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_impression_daily_totals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      card_impressions: {
        Row: {
          content_id: number
          id: number
          metadata: Json | null
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Insert: {
          content_id: number
          id?: never
          metadata?: Json | null
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Update: {
          content_id?: number
          id?: never
          metadata?: Json | null
          position?: number
          session_id?: string
          shown_at?: string
          source_surface?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_impressions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      card_impressions_default: {
        Row: {
          content_id: number
          id: number
          metadata: Json | null
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Insert: {
          content_id: number
          id?: never
          metadata?: Json | null
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Update: {
          content_id?: number
          id?: never
          metadata?: Json | null
          position?: number
          session_id?: string
          shown_at?: string
          source_surface?: string
          user_id?: string
        }
        Relationships: []
      }
      card_impressions_p20260401: {
        Row: {
          content_id: number
          id: number
          metadata: Json | null
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Insert: {
          content_id: number
          id?: never
          metadata?: Json | null
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Update: {
          content_id?: number
          id?: never
          metadata?: Json | null
          position?: number
          session_id?: string
          shown_at?: string
          source_surface?: string
          user_id?: string
        }
        Relationships: []
      }
      card_impressions_p20260501: {
        Row: {
          content_id: number
          id: number
          metadata: Json | null
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Insert: {
          content_id: number
          id?: never
          metadata?: Json | null
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Update: {
          content_id?: number
          id?: never
          metadata?: Json | null
          position?: number
          session_id?: string
          shown_at?: string
          source_surface?: string
          user_id?: string
        }
        Relationships: []
      }
      card_impressions_p20260601: {
        Row: {
          content_id: number
          id: number
          metadata: Json | null
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Insert: {
          content_id: number
          id?: never
          metadata?: Json | null
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Update: {
          content_id?: number
          id?: never
          metadata?: Json | null
          position?: number
          session_id?: string
          shown_at?: string
          source_surface?: string
          user_id?: string
        }
        Relationships: []
      }
      card_impressions_p20260701: {
        Row: {
          content_id: number
          id: number
          metadata: Json | null
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Insert: {
          content_id: number
          id?: never
          metadata?: Json | null
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Update: {
          content_id?: number
          id?: never
          metadata?: Json | null
          position?: number
          session_id?: string
          shown_at?: string
          source_surface?: string
          user_id?: string
        }
        Relationships: []
      }
      card_impressions_p20260801: {
        Row: {
          content_id: number
          id: number
          metadata: Json | null
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Insert: {
          content_id: number
          id?: never
          metadata?: Json | null
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Update: {
          content_id?: number
          id?: never
          metadata?: Json | null
          position?: number
          session_id?: string
          shown_at?: string
          source_surface?: string
          user_id?: string
        }
        Relationships: []
      }
      card_impressions_p20260901: {
        Row: {
          content_id: number
          id: number
          metadata: Json | null
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Insert: {
          content_id: number
          id?: never
          metadata?: Json | null
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Update: {
          content_id?: number
          id?: never
          metadata?: Json | null
          position?: number
          session_id?: string
          shown_at?: string
          source_surface?: string
          user_id?: string
        }
        Relationships: []
      }
      card_impressions_template: {
        Row: {
          content_id: number
          id: number
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Insert: {
          content_id: number
          id?: never
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Update: {
          content_id?: number
          id?: never
          position?: number
          session_id?: string
          shown_at?: string
          source_surface?: string
          user_id?: string
        }
        Relationships: []
      }
      clustering_runs: {
        Row: {
          catalogue_coverage_pct: number | null
          cluster_count: number | null
          cluster_params: Json
          completed_at: string | null
          error_message: string | null
          id: string
          noise_count: number | null
          started_at: string
          status: string
          version: number
        }
        Insert: {
          catalogue_coverage_pct?: number | null
          cluster_count?: number | null
          cluster_params: Json
          completed_at?: string | null
          error_message?: string | null
          id?: string
          noise_count?: number | null
          started_at?: string
          status: string
          version: number
        }
        Update: {
          catalogue_coverage_pct?: number | null
          cluster_count?: number | null
          cluster_params?: Json
          completed_at?: string | null
          error_message?: string | null
          id?: string
          noise_count?: number | null
          started_at?: string
          status?: string
          version?: number
        }
        Relationships: []
      }
      editor_notes: {
        Row: {
          body: string
          created_at: string
          expires_at: string | null
          id: string
          kicker: string
          published_at: string
          teaser: string | null
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          expires_at?: string | null
          id?: string
          kicker: string
          published_at?: string
          teaser?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          kicker?: string
          published_at?: string
          teaser?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mood_room_anchor_labels: {
        Row: {
          anchor_media_type: string
          anchor_tmdb_id: number
          description: string | null
          generated_at: string
          label: string
          openai_model: string
        }
        Insert: {
          anchor_media_type: string
          anchor_tmdb_id: number
          description?: string | null
          generated_at?: string
          label: string
          openai_model: string
        }
        Update: {
          anchor_media_type?: string
          anchor_tmdb_id?: number
          description?: string | null
          generated_at?: string
          label?: string
          openai_model?: string
        }
        Relationships: []
      }
      mood_room_titles: {
        Row: {
          centrality: number
          media_type: string
          mood_room_id: string
          tmdb_id: number
        }
        Insert: {
          centrality: number
          media_type: string
          mood_room_id: string
          tmdb_id: number
        }
        Update: {
          centrality?: number
          media_type?: string
          mood_room_id?: string
          tmdb_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "mood_room_titles_mood_room_id_fkey"
            columns: ["mood_room_id"]
            isOneToOne: false
            referencedRelation: "mood_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_rooms: {
        Row: {
          centroid: string
          cluster_params: Json
          created_at: string
          description: string | null
          id: string
          is_curated: boolean
          label: string
          title_count: number
          updated_at: string
          version: number
        }
        Insert: {
          centroid: string
          cluster_params: Json
          created_at?: string
          description?: string | null
          id?: string
          is_curated?: boolean
          label: string
          title_count: number
          updated_at?: string
          version: number
        }
        Update: {
          centroid?: string
          cluster_params?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_curated?: boolean
          label?: string
          title_count?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      onboarding_events: {
        Row: {
          created_at: string | null
          event_name: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_name: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_name?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      part_config: {
        Row: {
          async_partitioning_in_progress: string | null
          automatic_maintenance: string
          constraint_cols: string[] | null
          constraint_valid: boolean
          control: string
          date_trunc_interval: string | null
          datetime_string: string | null
          epoch: string
          ignore_default_data: boolean
          infinite_time_partitions: boolean
          inherit_privileges: boolean | null
          jobmon: boolean
          maintenance_last_run: string | null
          maintenance_order: number | null
          optimize_constraint: number
          parent_table: string
          partition_interval: string
          partition_type: string
          premake: number
          retention: string | null
          retention_keep_index: boolean
          retention_keep_publication: boolean
          retention_keep_table: boolean
          retention_schema: string | null
          sub_partition_set_full: boolean
          template_table: string | null
          time_decoder: string | null
          time_encoder: string | null
          undo_in_progress: boolean
        }
        Insert: {
          async_partitioning_in_progress?: string | null
          automatic_maintenance?: string
          constraint_cols?: string[] | null
          constraint_valid?: boolean
          control: string
          date_trunc_interval?: string | null
          datetime_string?: string | null
          epoch?: string
          ignore_default_data?: boolean
          infinite_time_partitions?: boolean
          inherit_privileges?: boolean | null
          jobmon?: boolean
          maintenance_last_run?: string | null
          maintenance_order?: number | null
          optimize_constraint?: number
          parent_table: string
          partition_interval: string
          partition_type: string
          premake?: number
          retention?: string | null
          retention_keep_index?: boolean
          retention_keep_publication?: boolean
          retention_keep_table?: boolean
          retention_schema?: string | null
          sub_partition_set_full?: boolean
          template_table?: string | null
          time_decoder?: string | null
          time_encoder?: string | null
          undo_in_progress?: boolean
        }
        Update: {
          async_partitioning_in_progress?: string | null
          automatic_maintenance?: string
          constraint_cols?: string[] | null
          constraint_valid?: boolean
          control?: string
          date_trunc_interval?: string | null
          datetime_string?: string | null
          epoch?: string
          ignore_default_data?: boolean
          infinite_time_partitions?: boolean
          inherit_privileges?: boolean | null
          jobmon?: boolean
          maintenance_last_run?: string | null
          maintenance_order?: number | null
          optimize_constraint?: number
          parent_table?: string
          partition_interval?: string
          partition_type?: string
          premake?: number
          retention?: string | null
          retention_keep_index?: boolean
          retention_keep_publication?: boolean
          retention_keep_table?: boolean
          retention_schema?: string | null
          sub_partition_set_full?: boolean
          template_table?: string | null
          time_decoder?: string | null
          time_encoder?: string | null
          undo_in_progress?: boolean
        }
        Relationships: []
      }
      part_config_sub: {
        Row: {
          sub_automatic_maintenance: string
          sub_constraint_cols: string[] | null
          sub_constraint_valid: boolean
          sub_control: string
          sub_control_not_null: boolean | null
          sub_date_trunc_interval: string | null
          sub_default_table: boolean | null
          sub_epoch: string
          sub_ignore_default_data: boolean
          sub_infinite_time_partitions: boolean
          sub_inherit_privileges: boolean | null
          sub_jobmon: boolean
          sub_maintenance_order: number | null
          sub_optimize_constraint: number
          sub_parent: string
          sub_partition_interval: string
          sub_partition_type: string
          sub_premake: number
          sub_retention: string | null
          sub_retention_keep_index: boolean
          sub_retention_keep_publication: boolean
          sub_retention_keep_table: boolean
          sub_retention_schema: string | null
          sub_template_table: string | null
          sub_time_decoder: string | null
          sub_time_encoder: string | null
        }
        Insert: {
          sub_automatic_maintenance?: string
          sub_constraint_cols?: string[] | null
          sub_constraint_valid?: boolean
          sub_control: string
          sub_control_not_null?: boolean | null
          sub_date_trunc_interval?: string | null
          sub_default_table?: boolean | null
          sub_epoch?: string
          sub_ignore_default_data?: boolean
          sub_infinite_time_partitions?: boolean
          sub_inherit_privileges?: boolean | null
          sub_jobmon?: boolean
          sub_maintenance_order?: number | null
          sub_optimize_constraint?: number
          sub_parent: string
          sub_partition_interval: string
          sub_partition_type: string
          sub_premake?: number
          sub_retention?: string | null
          sub_retention_keep_index?: boolean
          sub_retention_keep_publication?: boolean
          sub_retention_keep_table?: boolean
          sub_retention_schema?: string | null
          sub_template_table?: string | null
          sub_time_decoder?: string | null
          sub_time_encoder?: string | null
        }
        Update: {
          sub_automatic_maintenance?: string
          sub_constraint_cols?: string[] | null
          sub_constraint_valid?: boolean
          sub_control?: string
          sub_control_not_null?: boolean | null
          sub_date_trunc_interval?: string | null
          sub_default_table?: boolean | null
          sub_epoch?: string
          sub_ignore_default_data?: boolean
          sub_infinite_time_partitions?: boolean
          sub_inherit_privileges?: boolean | null
          sub_jobmon?: boolean
          sub_maintenance_order?: number | null
          sub_optimize_constraint?: number
          sub_parent?: string
          sub_partition_interval?: string
          sub_partition_type?: string
          sub_premake?: number
          sub_retention?: string | null
          sub_retention_keep_index?: boolean
          sub_retention_keep_publication?: boolean
          sub_retention_keep_table?: boolean
          sub_retention_schema?: string | null
          sub_template_table?: string | null
          sub_time_decoder?: string | null
          sub_time_encoder?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_config_sub_sub_parent_fkey"
            columns: ["sub_parent"]
            isOneToOne: true
            referencedRelation: "part_config"
            referencedColumns: ["parent_table"]
          },
        ]
      }
      profiles: {
        Row: {
          age_range: string | null
          created_at: string | null
          id: string
          is_test_user: boolean | null
          onboarding_completed: boolean | null
          region: string | null
          theme_preference: string | null
          updated_at: string | null
          username: string
          viewing_context: string | null
        }
        Insert: {
          age_range?: string | null
          created_at?: string | null
          id: string
          is_test_user?: boolean | null
          onboarding_completed?: boolean | null
          region?: string | null
          theme_preference?: string | null
          updated_at?: string | null
          username: string
          viewing_context?: string | null
        }
        Update: {
          age_range?: string | null
          created_at?: string | null
          id?: string
          is_test_user?: boolean | null
          onboarding_completed?: boolean | null
          region?: string | null
          theme_preference?: string | null
          updated_at?: string | null
          username?: string
          viewing_context?: string | null
        }
        Relationships: []
      }
      service_fingerprints: {
        Row: {
          centroid: string
          computed_at: string
          region: string
          service_id: string
          source_title_ids: number[]
          title_count: number
          variant: string
        }
        Insert: {
          centroid: string
          computed_at?: string
          region?: string
          service_id: string
          source_title_ids: number[]
          title_count: number
          variant: string
        }
        Update: {
          centroid?: string
          computed_at?: string
          region?: string
          service_id?: string
          source_title_ids?: number[]
          title_count?: number
          variant?: string
        }
        Relationships: []
      }
      streaming_availability: {
        Row: {
          addon_id: string | null
          addon_name: string | null
          available_since: string | null
          created_at: string | null
          deep_link_url: string
          expires_on: string | null
          expires_soon: boolean | null
          id: string
          last_verified_at: string | null
          media_type: string
          price_amount: number | null
          price_currency: string | null
          price_formatted: string | null
          quality: string | null
          sa_service_id: string
          service_id: string
          stream_type: string
          tmdb_confirmed: boolean | null
          tmdb_id: number
          updated_at: string | null
          video_link_url: string | null
        }
        Insert: {
          addon_id?: string | null
          addon_name?: string | null
          available_since?: string | null
          created_at?: string | null
          deep_link_url: string
          expires_on?: string | null
          expires_soon?: boolean | null
          id?: string
          last_verified_at?: string | null
          media_type: string
          price_amount?: number | null
          price_currency?: string | null
          price_formatted?: string | null
          quality?: string | null
          sa_service_id: string
          service_id: string
          stream_type: string
          tmdb_confirmed?: boolean | null
          tmdb_id: number
          updated_at?: string | null
          video_link_url?: string | null
        }
        Update: {
          addon_id?: string | null
          addon_name?: string | null
          available_since?: string | null
          created_at?: string | null
          deep_link_url?: string
          expires_on?: string | null
          expires_soon?: boolean | null
          id?: string
          last_verified_at?: string | null
          media_type?: string
          price_amount?: number | null
          price_currency?: string | null
          price_formatted?: string | null
          quality?: string | null
          sa_service_id?: string
          service_id?: string
          stream_type?: string
          tmdb_confirmed?: boolean | null
          tmdb_id?: number
          updated_at?: string | null
          video_link_url?: string | null
        }
        Relationships: []
      }
      streaming_history: {
        Row: {
          event_type: string
          id: number
          link: string | null
          media_type: string
          old_price_amount: number | null
          price_amount: number | null
          price_currency: string | null
          quality: string | null
          recorded_at: string
          service_id: string
          stream_type: string | null
          sync_run_id: string | null
          tmdb_id: number
        }
        Insert: {
          event_type: string
          id?: never
          link?: string | null
          media_type: string
          old_price_amount?: number | null
          price_amount?: number | null
          price_currency?: string | null
          quality?: string | null
          recorded_at?: string
          service_id: string
          stream_type?: string | null
          sync_run_id?: string | null
          tmdb_id: number
        }
        Update: {
          event_type?: string
          id?: never
          link?: string | null
          media_type?: string
          old_price_amount?: number | null
          price_amount?: number | null
          price_currency?: string | null
          quality?: string | null
          recorded_at?: string
          service_id?: string
          stream_type?: string | null
          sync_run_id?: string | null
          tmdb_id?: number
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          completed_at: string | null
          error_details: Json | null
          errors: number | null
          id: string
          source: string
          started_at: string | null
          status: string | null
          sync_type: string
          titles_added: number | null
          titles_processed: number | null
          titles_removed: number | null
          titles_updated: number | null
        }
        Insert: {
          completed_at?: string | null
          error_details?: Json | null
          errors?: number | null
          id?: string
          source: string
          started_at?: string | null
          status?: string | null
          sync_type: string
          titles_added?: number | null
          titles_processed?: number | null
          titles_removed?: number | null
          titles_updated?: number | null
        }
        Update: {
          completed_at?: string | null
          error_details?: Json | null
          errors?: number | null
          id?: string
          source?: string
          started_at?: string | null
          status?: string | null
          sync_type?: string
          titles_added?: number | null
          titles_processed?: number | null
          titles_removed?: number | null
          titles_updated?: number | null
        }
        Relationships: []
      }
      taste_profiles: {
        Row: {
          created_at: string | null
          home_genres: number[] | null
          last_updated: string | null
          selected_clusters: string[] | null
          slider_catalogue_age: number | null
          slider_comfort_zone: number | null
          slider_content_mix: number | null
          slider_variety: number | null
          taste_vector_bootstrapped_from: string | null
          taste_vector_interaction_count: number
          taste_vector_updated_at: string | null
          taste_vector_v2: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          home_genres?: number[] | null
          last_updated?: string | null
          selected_clusters?: string[] | null
          slider_catalogue_age?: number | null
          slider_comfort_zone?: number | null
          slider_content_mix?: number | null
          slider_variety?: number | null
          taste_vector_bootstrapped_from?: string | null
          taste_vector_interaction_count?: number
          taste_vector_updated_at?: string | null
          taste_vector_v2?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          home_genres?: number[] | null
          last_updated?: string | null
          selected_clusters?: string[] | null
          slider_catalogue_age?: number | null
          slider_comfort_zone?: number | null
          slider_content_mix?: number | null
          slider_variety?: number | null
          taste_vector_bootstrapped_from?: string | null
          taste_vector_interaction_count?: number
          taste_vector_updated_at?: string | null
          taste_vector_v2?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "taste_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      template_public_card_impressions: {
        Row: {
          content_id: number
          id: number
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Insert: {
          content_id: number
          id: number
          position: number
          session_id: string
          shown_at: string
          source_surface: string
          user_id: string
        }
        Update: {
          content_id?: number
          id?: number
          position?: number
          session_id?: string
          shown_at?: string
          source_surface?: string
          user_id?: string
        }
        Relationships: []
      }
      titles: {
        Row: {
          backdrop_path: string | null
          cast_top_5: string[] | null
          content_rating: string | null
          created_at: string | null
          director: string | null
          embedding: string | null
          genre_ids: number[] | null
          id: number
          imdb_id: string | null
          imdb_rating: number | null
          keywords: string[] | null
          last_synced_at: string | null
          media_type: string
          number_of_seasons: number | null
          original_language: string | null
          original_title: string | null
          overview: string | null
          popularity: number | null
          poster_path: string | null
          release_date: string | null
          release_year: number | null
          rt_score: string | null
          runtime: number | null
          status: string | null
          title: string
          tmdb_id: number
          updated_at: string | null
          vote_average: number | null
          vote_count: number | null
        }
        Insert: {
          backdrop_path?: string | null
          cast_top_5?: string[] | null
          content_rating?: string | null
          created_at?: string | null
          director?: string | null
          embedding?: string | null
          genre_ids?: number[] | null
          id?: number
          imdb_id?: string | null
          imdb_rating?: number | null
          keywords?: string[] | null
          last_synced_at?: string | null
          media_type: string
          number_of_seasons?: number | null
          original_language?: string | null
          original_title?: string | null
          overview?: string | null
          popularity?: number | null
          poster_path?: string | null
          release_date?: string | null
          release_year?: number | null
          rt_score?: string | null
          runtime?: number | null
          status?: string | null
          title: string
          tmdb_id: number
          updated_at?: string | null
          vote_average?: number | null
          vote_count?: number | null
        }
        Update: {
          backdrop_path?: string | null
          cast_top_5?: string[] | null
          content_rating?: string | null
          created_at?: string | null
          director?: string | null
          embedding?: string | null
          genre_ids?: number[] | null
          id?: number
          imdb_id?: string | null
          imdb_rating?: number | null
          keywords?: string[] | null
          last_synced_at?: string | null
          media_type?: string
          number_of_seasons?: number | null
          original_language?: string | null
          original_title?: string | null
          overview?: string | null
          popularity?: number | null
          poster_path?: string | null
          release_date?: string | null
          release_year?: number | null
          rt_score?: string | null
          runtime?: number | null
          status?: string | null
          title?: string
          tmdb_id?: number
          updated_at?: string | null
          vote_average?: number | null
          vote_count?: number | null
        }
        Relationships: []
      }
      user_feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          flag_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          flag_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          flag_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_genres: {
        Row: {
          created_at: string | null
          genre_id: string
          id: string
          rank: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          genre_id: string
          id?: string
          rank?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          genre_id?: string
          id?: string
          rank?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_genres_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_interactions: {
        Row: {
          content_id: number | null
          created_at: string | null
          event_type: string
          id: string
          media_type: string | null
          metadata: Json | null
          session_id: string | null
          source_surface: string | null
          user_id: string
        }
        Insert: {
          content_id?: number | null
          created_at?: string | null
          event_type: string
          id?: string
          media_type?: string | null
          metadata?: Json | null
          session_id?: string | null
          source_surface?: string | null
          user_id: string
        }
        Update: {
          content_id?: number | null
          created_at?: string | null
          event_type?: string
          id?: string
          media_type?: string | null
          metadata?: Json | null
          session_id?: string | null
          source_surface?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          delivery_status: string
          error_detail: string | null
          expo_ticket_id: string | null
          id: string
          media_type: string
          notification_type: string
          push_token_id: string | null
          sent_at: string
          service_id: string | null
          title: string | null
          tmdb_id: number
          user_id: string
        }
        Insert: {
          delivery_status?: string
          error_detail?: string | null
          expo_ticket_id?: string | null
          id?: string
          media_type: string
          notification_type: string
          push_token_id?: string | null
          sent_at?: string
          service_id?: string | null
          title?: string | null
          tmdb_id: number
          user_id: string
        }
        Update: {
          delivery_status?: string
          error_detail?: string | null
          expo_ticket_id?: string | null
          id?: string
          media_type?: string
          notification_type?: string
          push_token_id?: string | null
          sent_at?: string
          service_id?: string | null
          title?: string | null
          tmdb_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_push_token_id_fkey"
            columns: ["push_token_id"]
            isOneToOne: false
            referencedRelation: "user_push_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          enabled: boolean
          notification_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          notification_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          notification_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          device_id: string | null
          device_name: string | null
          expo_push_token: string
          id: string
          last_seen_at: string
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_id?: string | null
          device_name?: string | null
          expo_push_token: string
          id?: string
          last_seen_at?: string
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_id?: string | null
          device_name?: string | null
          expo_push_token?: string
          id?: string
          last_seen_at?: string
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_interest_centroids: {
        Row: {
          centroid: string
          slot: number
          updated_at: string
          user_id: string
          weight: number
        }
        Insert: {
          centroid: string
          slot: number
          updated_at?: string
          user_id: string
          weight?: number
        }
        Update: {
          centroid?: string
          slot?: number
          updated_at?: string
          user_id?: string
          weight?: number
        }
        Relationships: []
      }
      user_services: {
        Row: {
          created_at: string | null
          id: string
          service_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          service_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          service_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_services_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist: {
        Row: {
          added_at: string | null
          genre_ids: number[] | null
          id: string
          media_type: string
          poster_path: string | null
          rating: string | null
          status: string
          title: string | null
          tmdb_id: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          added_at?: string | null
          genre_ids?: number[] | null
          id?: string
          media_type: string
          poster_path?: string | null
          rating?: string | null
          status: string
          title?: string | null
          tmdb_id: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          added_at?: string | null
          genre_ids?: number[] | null
          id?: string
          media_type?: string
          poster_path?: string | null
          rating?: string | null
          status?: string
          title?: string | null
          tmdb_id?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      data_freshness: {
        Row: {
          fresh_24h: number | null
          fresh_7d: number | null
          newest_record: string | null
          oldest_record: string | null
          table_name: string | null
          total_rows: number | null
          with_imdb_id: number | null
        }
        Relationships: []
      }
      deep_link_coverage: {
        Row: {
          addon_links: number | null
          expiring_soon: number | null
          free_links: number | null
          newest_link: string | null
          oldest_link: string | null
          rent_buy_links: number | null
          service_id: string | null
          subscription_links: number | null
          titles_with_links: number | null
          total_links: number | null
        }
        Relationships: []
      }
      ratings_coverage: {
        Row: {
          missing_rt_with_imdb: number | null
          rt_coverage_pct: number | null
          total_titles: number | null
          with_imdb_id: number | null
          with_imdb_rating: number | null
          with_rt_score: number | null
        }
        Relationships: []
      }
      sa_unconfirmed_availability: {
        Row: {
          deep_link_url: string | null
          last_verified_at: string | null
          media_type: string | null
          popularity: number | null
          service_id: string | null
          stream_type: string | null
          title: string | null
          tmdb_id: number | null
        }
        Relationships: []
      }
      service_confirmation_rates: {
        Row: {
          confirmation_pct: number | null
          confirmed: number | null
          service_id: string | null
          total_entries: number | null
          unconfirmed: number | null
        }
        Relationships: []
      }
      sync_history: {
        Row: {
          completed_at: string | null
          duration_seconds: number | null
          errors: number | null
          source: string | null
          started_at: string | null
          status: string | null
          sync_type: string | null
          titles_added: number | null
          titles_processed: number | null
          titles_removed: number | null
          titles_updated: number | null
        }
        Relationships: []
      }
      table_privs: {
        Row: {
          grantee: unknown
          grantor: unknown
          privilege_type: string | null
          table_name: unknown
          table_schema: unknown
        }
        Relationships: []
      }
      v_training_examples: {
        Row: {
          content_id: number | null
          exploration: boolean | null
          label_positive: boolean | null
          outcome_at: string | null
          outcome_event: string | null
          position: number | null
          position_at_click: number | null
          session_id: string | null
          shown_at: string | null
          source_surface: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_impressions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_cluster: {
        Args: {
          p_child_schema: string
          p_child_tablename: string
          p_parent_schema: string
          p_parent_tablename: string
        }
        Returns: undefined
      }
      apply_constraints: {
        Args: {
          p_analyze?: boolean
          p_child_table?: string
          p_job_id?: number
          p_parent_table: string
        }
        Returns: undefined
      }
      apply_privileges: {
        Args: {
          p_child_schema: string
          p_child_tablename: string
          p_job_id?: number
          p_parent_schema: string
          p_parent_tablename: string
        }
        Returns: undefined
      }
      autovacuum_off: {
        Args: {
          p_parent_schema: string
          p_parent_tablename: string
          p_source_schema?: string
          p_source_tablename?: string
        }
        Returns: boolean
      }
      autovacuum_reset: {
        Args: {
          p_parent_schema: string
          p_parent_tablename: string
          p_source_schema?: string
          p_source_tablename?: string
        }
        Returns: boolean
      }
      calculate_time_partition_info: {
        Args: {
          p_date_trunc_interval?: string
          p_start_time: string
          p_time_interval: string
        }
        Returns: Record<string, unknown>
      }
      check_automatic_maintenance_value: {
        Args: { p_automatic_maintenance: string }
        Returns: boolean
      }
      check_control_type: {
        Args: {
          p_control: string
          p_parent_schema: string
          p_parent_tablename: string
        }
        Returns: {
          exact_type: string
          general_type: string
        }[]
      }
      check_default: {
        Args: { p_exact_count?: boolean }
        Returns: Database["public"]["CompositeTypes"]["check_default_table"][]
        SetofOptions: {
          from: "*"
          to: "check_default_table"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      check_epoch_type: { Args: { p_type: string }; Returns: boolean }
      check_name_length: {
        Args: {
          p_object_name: string
          p_suffix?: string
          p_table_partition?: boolean
        }
        Returns: string
      }
      check_orphaned_availability: {
        Args: never
        Returns: {
          deep_link_url: string
          media_type: string
          service_id: string
          tmdb_id: number
        }[]
      }
      check_partition_type: { Args: { p_type: string }; Returns: boolean }
      check_stale_availability: {
        Args: never
        Returns: {
          oldest_verified: string
          service_id: string
          stale_count: number
        }[]
      }
      check_subpart_sameconfig: {
        Args: { p_parent_table: string }
        Returns: {
          sub_automatic_maintenance: string
          sub_constraint_cols: string[]
          sub_constraint_valid: boolean
          sub_control: string
          sub_control_not_null: boolean
          sub_date_trunc_interval: string
          sub_default_table: boolean
          sub_epoch: string
          sub_ignore_default_data: boolean
          sub_infinite_time_partitions: boolean
          sub_inherit_privileges: boolean
          sub_jobmon: boolean
          sub_maintenance_order: number
          sub_optimize_constraint: number
          sub_partition_interval: string
          sub_partition_type: string
          sub_premake: number
          sub_retention: string
          sub_retention_keep_index: boolean
          sub_retention_keep_publication: boolean
          sub_retention_keep_table: boolean
          sub_retention_schema: string
          sub_template_table: string
        }[]
      }
      check_subpartition_limits: {
        Args: { p_parent_table: string; p_type: string }
        Returns: Record<string, unknown>
      }
      check_titles_without_availability: {
        Args: never
        Returns: {
          media_type: string
          popularity: number
          title: string
          tmdb_id: number
        }[]
      }
      create_parent: {
        Args: {
          p_automatic_maintenance?: string
          p_constraint_cols?: string[]
          p_control: string
          p_control_not_null?: boolean
          p_date_trunc_interval?: string
          p_default_table?: boolean
          p_epoch?: string
          p_interval: string
          p_jobmon?: boolean
          p_offset_id?: number
          p_parent_table: string
          p_premake?: number
          p_start_partition?: string
          p_template_table?: string
          p_time_decoder?: string
          p_time_encoder?: string
          p_type?: string
        }
        Returns: boolean
      }
      create_partition_id: {
        Args: {
          p_parent_table: string
          p_partition_ids: number[]
          p_start_partition?: string
        }
        Returns: boolean
      }
      create_partition_time: {
        Args: {
          p_parent_table: string
          p_partition_times: string[]
          p_start_partition?: string
        }
        Returns: boolean
      }
      create_sub_parent: {
        Args: {
          p_constraint_cols?: string[]
          p_control: string
          p_control_not_null?: boolean
          p_date_trunc_interval?: string
          p_declarative_check?: string
          p_default_table?: boolean
          p_epoch?: string
          p_interval: string
          p_jobmon?: boolean
          p_premake?: number
          p_start_partition?: string
          p_time_decoder?: string
          p_time_encoder?: string
          p_top_parent: string
          p_type?: string
        }
        Returns: boolean
      }
      delete_own_account: { Args: never; Returns: undefined }
      drop_constraints: {
        Args: {
          p_child_table: string
          p_debug?: boolean
          p_parent_table: string
        }
        Returns: undefined
      }
      drop_partition_id: {
        Args: {
          p_keep_index?: boolean
          p_keep_table?: boolean
          p_parent_table: string
          p_retention?: number
          p_retention_schema?: string
        }
        Returns: number
      }
      drop_partition_time: {
        Args: {
          p_keep_index?: boolean
          p_keep_table?: boolean
          p_parent_table: string
          p_reference_timestamp?: string
          p_retention?: string
          p_retention_schema?: string
        }
        Returns: number
      }
      dump_partitioned_table_definition: {
        Args: { p_ignore_template_table?: boolean; p_parent_table: string }
        Returns: string
      }
      export_user_data: { Args: never; Returns: Json }
      get_available_tmdb_ids: { Args: { service_ids: string[] }; Returns: Json }
      get_mood_room_detail: {
        Args: { available_tmdb_ids: number[]; room_id: string }
        Returns: {
          centrality: number
          description: string
          genre_ids: number[]
          label: string
          media_type: string
          original_language: string
          overview: string
          popularity: number
          poster_path: string
          release_year: number
          runtime: number
          title: string
          tmdb_id: number
          total_title_count: number
          vote_average: number
          vote_count: number
        }[]
      }
      get_mood_room_thumbnails: {
        Args: {
          available_tmdb_ids: number[]
          per_room_limit?: number
          room_ids: string[]
        }
        Returns: {
          centrality: number
          genre_ids: number[]
          media_type: string
          mood_room_id: string
          poster_path: string
          release_year: number
          title: string
          tmdb_id: number
        }[]
      }
      get_mood_rooms_for_user: {
        Args: {
          available_tmdb_ids: number[]
          min_available_titles?: number
          result_limit?: number
          user_taste_vector: string
        }
        Returns: {
          available_count: number
          description: string
          label: string
          room_id: string
          taste_distance: number
          title_count: number
        }[]
      }
      get_stale_availability: {
        Args: { limit_count?: number }
        Returns: {
          imdb_id: string
          media_type: string
          tmdb_id: number
        }[]
      }
      get_stale_ratings: {
        Args: { limit_count?: number }
        Returns: {
          imdb_id: string
          media_type: string
          tmdb_id: number
        }[]
      }
      get_stale_titles: {
        Args: { limit_count?: number }
        Returns: {
          imdb_id: string
          media_type: string
          tmdb_id: number
        }[]
      }
      inherit_replica_identity: {
        Args: {
          p_child_tablename: string
          p_parent_schemaname: string
          p_parent_tablename: string
        }
        Returns: undefined
      }
      inherit_template_properties: {
        Args: {
          p_child_schema: string
          p_child_tablename: string
          p_parent_table: string
        }
        Returns: boolean
      }
      match_titles_by_vector: {
        Args: { match_limit?: number; query_vector: string }
        Returns: {
          distance: number
          id: number
          media_type: string
          title: string
          tmdb_id: number
        }[]
      }
      partition_data_id: {
        Args: {
          p_analyze?: boolean
          p_batch_count?: number
          p_batch_interval?: number
          p_ignored_columns?: string[]
          p_lock_wait?: number
          p_order?: string
          p_override_system_value?: boolean
          p_parent_table: string
          p_source_table?: string
        }
        Returns: number
      }
      partition_data_time: {
        Args: {
          p_analyze?: boolean
          p_batch_count?: number
          p_batch_interval?: string
          p_ignored_columns?: string[]
          p_lock_wait?: number
          p_order?: string
          p_override_system_value?: boolean
          p_parent_table: string
          p_source_table?: string
        }
        Returns: number
      }
      partition_gap_fill: { Args: { p_parent_table: string }; Returns: number }
      reapply_privileges: {
        Args: { p_parent_table: string }
        Returns: undefined
      }
      run_data_quality_check: {
        Args: never
        Returns: {
          check_name: string
          details: string
          result_count: number
        }[]
      }
      run_maintenance: {
        Args: {
          p_analyze?: boolean
          p_jobmon?: boolean
          p_parent_table?: string
        }
        Returns: undefined
      }
      show_partition_info: {
        Args: {
          p_child_table: string
          p_parent_table?: string
          p_partition_interval?: string
          p_table_exists?: boolean
        }
        Returns: Record<string, unknown>
      }
      show_partition_name: {
        Args: { p_parent_table: string; p_value: string }
        Returns: Record<string, unknown>
      }
      show_partitions: {
        Args: {
          p_include_default?: boolean
          p_order?: string
          p_parent_table: string
        }
        Returns: {
          partition_schemaname: string
          partition_tablename: string
        }[]
      }
      stop_sub_partition: {
        Args: { p_jobmon?: boolean; p_parent_table: string }
        Returns: boolean
      }
      undo_partition: {
        Args: {
          p_batch_interval?: string
          p_drop_cascade?: boolean
          p_ignored_columns?: string[]
          p_keep_table?: boolean
          p_lock_wait?: number
          p_loop_count?: number
          p_parent_table: string
          p_target_table: string
        }
        Returns: Record<string, unknown>
      }
      username_available: { Args: { check_username: string }; Returns: boolean }
      uuid7_time_decoder: { Args: { uuidv7: string }; Returns: string }
      uuid7_time_encoder: { Args: { ts: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      check_default_table: {
        default_table: string | null
        count: number | null
      }
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
    Enums: {},
  },
} as const
