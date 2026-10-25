
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "artist_listening_snapshots": {
                  Row: {
                    "artist_id": string,"batch_id": string,"id": string,"rank": number,"synced_at": string,"time_range": Database["public"]['Enums']["spotify_time_range"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "artist_id": string,"batch_id": string,"id"?: string,"rank": number,"synced_at"?: string,"time_range": Database["public"]['Enums']["spotify_time_range"],"user_id": string
                  }
                  Update: {
                    "artist_id"?: string,"batch_id"?: string,"id"?: string,"rank"?: number,"synced_at"?: string,"time_range"?: Database["public"]['Enums']["spotify_time_range"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "artist_listening_snapshots_artist_id_fkey"
      columns: ["artist_id"]
isOneToOne: false
      referencedRelation: "artists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "artist_listening_snapshots_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"artist_provider_ids": {
                  Row: {
                    "artist_id": string,"created_at": string,"external_artist_id": string,"external_url": string | null,"id": string,"match_confidence": number,"match_method": Database["public"]['Enums']["match_method"],"provider": string
                  }
                  ComputedFields: never
                  Insert: {
                    "artist_id": string,"created_at"?: string,"external_artist_id": string,"external_url"?: string | null,"id"?: string,"match_confidence"?: number,"match_method"?: Database["public"]['Enums']["match_method"],"provider": string
                  }
                  Update: {
                    "artist_id"?: string,"created_at"?: string,"external_artist_id"?: string,"external_url"?: string | null,"id"?: string,"match_confidence"?: number,"match_method"?: Database["public"]['Enums']["match_method"],"provider"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "artist_provider_ids_artist_id_fkey"
      columns: ["artist_id"]
isOneToOne: false
      referencedRelation: "artists"
      referencedColumns: ["id"]
    }
                  ]
                },"artists": {
                  Row: {
                    "canonical_name": string,"created_at": string,"events_refreshed_at": string | null,"genres": (string)[],"id": string,"image_url": string | null,"metadata_source": string,"normalized_name": string | null,"provider_lookup_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "canonical_name": string,"created_at"?: string,"events_refreshed_at"?: string | null,"genres"?: (string)[],"id"?: string,"image_url"?: string | null,"metadata_source": string,"normalized_name"?: never,"provider_lookup_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "canonical_name"?: string,"created_at"?: string,"events_refreshed_at"?: string | null,"genres"?: (string)[],"id"?: string,"image_url"?: string | null,"metadata_source"?: string,"normalized_name"?: never,"provider_lookup_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cities": {
                  Row: {
                    "country_code": string,"id": string,"latitude": number,"longitude": number,"name": string,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "country_code": string,"id"?: string,"latitude": number,"longitude": number,"name": string,"timezone": string
                  }
                  Update: {
                    "country_code"?: string,"id"?: string,"latitude"?: number,"longitude"?: number,"name"?: string,"timezone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"connected_accounts": {
                  Row: {
                    "access_token_encrypted": string | null,"connected_at": string,"expires_at": string | null,"id": string,"last_successful_sync_at": string | null,"last_sync_attempt_at": string | null,"last_sync_error": string | null,"next_sync_at": string,"provider": string,"provider_user_id": string,"refresh_token_encrypted": string | null,"scopes": (string)[],"status": Database["public"]['Enums']["connected_account_status"],"sync_failure_count": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_token_encrypted"?: string | null,"connected_at"?: string,"expires_at"?: string | null,"id"?: string,"last_successful_sync_at"?: string | null,"last_sync_attempt_at"?: string | null,"last_sync_error"?: string | null,"next_sync_at"?: string,"provider": string,"provider_user_id": string,"refresh_token_encrypted"?: string | null,"scopes"?: (string)[],"status"?: Database["public"]['Enums']["connected_account_status"],"sync_failure_count"?: number,"user_id": string
                  }
                  Update: {
                    "access_token_encrypted"?: string | null,"connected_at"?: string,"expires_at"?: string | null,"id"?: string,"last_successful_sync_at"?: string | null,"last_sync_attempt_at"?: string | null,"last_sync_error"?: string | null,"next_sync_at"?: string,"provider"?: string,"provider_user_id"?: string,"refresh_token_encrypted"?: string | null,"scopes"?: (string)[],"status"?: Database["public"]['Enums']["connected_account_status"],"sync_failure_count"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "connected_accounts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"event_artists": {
                  Row: {
                    "artist_id": string,"event_id": string,"match_confidence": number,"match_method": Database["public"]['Enums']["match_method"]
                  }
                  ComputedFields: never
                  Insert: {
                    "artist_id": string,"event_id": string,"match_confidence": number,"match_method": Database["public"]['Enums']["match_method"]
                  }
                  Update: {
                    "artist_id"?: string,"event_id"?: string,"match_confidence"?: number,"match_method"?: Database["public"]['Enums']["match_method"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_artists_artist_id_fkey"
      columns: ["artist_id"]
isOneToOne: false
      referencedRelation: "artists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_artists_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"event_changes": {
                  Row: {
                    "detected_at": string,"event_id": string,"field": string,"id": string,"new_value": string | null,"old_value": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "detected_at"?: string,"event_id": string,"field": string,"id"?: string,"new_value"?: string | null,"old_value"?: string | null
                  }
                  Update: {
                    "detected_at"?: string,"event_id"?: string,"field"?: string,"id"?: string,"new_value"?: string | null,"old_value"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_changes_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"event_dismissals": {
                  Row: {
                    "created_at": string,"event_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_dismissals_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_dismissals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"event_interests": {
                  Row: {
                    "created_at": string,"event_id": string,"id": string,"intention": Database["public"]['Enums']["event_intention"],"updated_at": string,"user_id": string,"visibility": Database["public"]['Enums']["social_visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"id"?: string,"intention": Database["public"]['Enums']["event_intention"],"updated_at"?: string,"user_id": string,"visibility"?: Database["public"]['Enums']["social_visibility"]
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"id"?: string,"intention"?: Database["public"]['Enums']["event_intention"],"updated_at"?: string,"user_id"?: string,"visibility"?: Database["public"]['Enums']["social_visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_interests_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_interests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"event_provider_records": {
                  Row: {
                    "event_id": string,"external_event_id": string,"external_title": string,"id": string,"is_primary": boolean,"last_synced_at": string,"provider": string,"raw_payload_hash": string | null,"source_status": string | null,"source_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"external_event_id": string,"external_title": string,"id"?: string,"is_primary"?: boolean,"last_synced_at"?: string,"provider": string,"raw_payload_hash"?: string | null,"source_status"?: string | null,"source_url"?: string | null
                  }
                  Update: {
                    "event_id"?: string,"external_event_id"?: string,"external_title"?: string,"id"?: string,"is_primary"?: boolean,"last_synced_at"?: string,"provider"?: string,"raw_payload_hash"?: string | null,"source_status"?: string | null,"source_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_provider_records_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"event_sales": {
                  Row: {
                    "ends_at": string | null,"event_id": string,"id": string,"last_verified_at": string,"provider_record_id": string,"sale_key": string,"sale_name": string | null,"sale_type": Database["public"]['Enums']["sale_type"],"start_time_unknown": boolean,"starts_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ends_at"?: string | null,"event_id": string,"id"?: string,"last_verified_at"?: string,"provider_record_id": string,"sale_key": string,"sale_name"?: string | null,"sale_type": Database["public"]['Enums']["sale_type"],"start_time_unknown"?: boolean,"starts_at"?: string | null
                  }
                  Update: {
                    "ends_at"?: string | null,"event_id"?: string,"id"?: string,"last_verified_at"?: string,"provider_record_id"?: string,"sale_key"?: string,"sale_name"?: string | null,"sale_type"?: Database["public"]['Enums']["sale_type"],"start_time_unknown"?: boolean,"starts_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_sales_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_sales_provider_record_id_fkey"
      columns: ["provider_record_id"]
isOneToOne: false
      referencedRelation: "event_provider_records"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "canonical_title": string,"created_at": string,"ends_at": string | null,"event_url": string | null,"id": string,"image_url": string | null,"last_verified_at": string,"lifecycle_status": Database["public"]['Enums']["event_lifecycle_status"],"start_date_local": string | null,"start_time_tba": boolean,"starts_at": string | null,"timezone": string | null,"updated_at": string,"venue_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "canonical_title": string,"created_at"?: string,"ends_at"?: string | null,"event_url"?: string | null,"id"?: string,"image_url"?: string | null,"last_verified_at"?: string,"lifecycle_status"?: Database["public"]['Enums']["event_lifecycle_status"],"start_date_local"?: string | null,"start_time_tba"?: boolean,"starts_at"?: string | null,"timezone"?: string | null,"updated_at"?: string,"venue_id"?: string | null
                  }
                  Update: {
                    "canonical_title"?: string,"created_at"?: string,"ends_at"?: string | null,"event_url"?: string | null,"id"?: string,"image_url"?: string | null,"last_verified_at"?: string,"lifecycle_status"?: Database["public"]['Enums']["event_lifecycle_status"],"start_date_local"?: string | null,"start_time_tba"?: boolean,"starts_at"?: string | null,"timezone"?: string | null,"updated_at"?: string,"venue_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"friend_invites": {
                  Row: {
                    "created_at": string,"expires_at": string,"inviter_id": string,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string,"inviter_id": string,"token"?: string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"inviter_id"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "friend_invites_inviter_id_fkey"
      columns: ["inviter_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"friendships": {
                  Row: {
                    "created_at": string,"id": string,"recipient_id": string,"requester_id": string,"status": Database["public"]['Enums']["friendship_status"],"updated_at": string,"user_high": string | null,"user_low": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"recipient_id": string,"requester_id": string,"status"?: Database["public"]['Enums']["friendship_status"],"updated_at"?: string,"user_high"?: never,"user_low"?: never
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"recipient_id"?: string,"requester_id"?: string,"status"?: Database["public"]['Enums']["friendship_status"],"updated_at"?: string,"user_high"?: never,"user_low"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "friendships_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "friendships_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"job_runs": {
                  Row: {
                    "details": NonNullable<Json>,"error": string | null,"finished_at": string | null,"id": string,"job_name": string,"started_at": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "details"?: NonNullable<Json>,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"job_name": string,"started_at"?: string,"status"?: string
                  }
                  Update: {
                    "details"?: NonNullable<Json>,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"job_name"?: string,"started_at"?: string,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notification_jobs": {
                  Row: {
                    "actor_id": string | null,"attempt_count": number,"created_at": string,"deduplication_key": string,"delivered_at": string | null,"event_id": string | null,"id": string,"last_error": string | null,"locked_at": string | null,"max_attempts": number,"notification_type": Database["public"]['Enums']["notification_type"],"sale_id": string | null,"sale_starts_at_snapshot": string | null,"scheduled_at": string,"status": Database["public"]['Enums']["notification_job_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"attempt_count"?: number,"created_at"?: string,"deduplication_key": string,"delivered_at"?: string | null,"event_id"?: string | null,"id"?: string,"last_error"?: string | null,"locked_at"?: string | null,"max_attempts"?: number,"notification_type": Database["public"]['Enums']["notification_type"],"sale_id"?: string | null,"sale_starts_at_snapshot"?: string | null,"scheduled_at": string,"status"?: Database["public"]['Enums']["notification_job_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"attempt_count"?: number,"created_at"?: string,"deduplication_key"?: string,"delivered_at"?: string | null,"event_id"?: string | null,"id"?: string,"last_error"?: string | null,"locked_at"?: string | null,"max_attempts"?: number,"notification_type"?: Database["public"]['Enums']["notification_type"],"sale_id"?: string | null,"sale_starts_at_snapshot"?: string | null,"scheduled_at"?: string,"status"?: Database["public"]['Enums']["notification_job_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_jobs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_jobs_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_jobs_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "event_sales"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_jobs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "friend_activity_enabled": boolean,"general_sale_reminders_enabled": boolean,"new_event_alerts_enabled": boolean,"presale_reminders_enabled": boolean,"push_enabled": boolean,"quiet_hours_end": string | null,"quiet_hours_start": string | null,"reminder_lead_minutes": number,"timezone": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "friend_activity_enabled"?: boolean,"general_sale_reminders_enabled"?: boolean,"new_event_alerts_enabled"?: boolean,"presale_reminders_enabled"?: boolean,"push_enabled"?: boolean,"quiet_hours_end"?: string | null,"quiet_hours_start"?: string | null,"reminder_lead_minutes"?: number,"timezone"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "friend_activity_enabled"?: boolean,"general_sale_reminders_enabled"?: boolean,"new_event_alerts_enabled"?: boolean,"presale_reminders_enabled"?: boolean,"push_enabled"?: boolean,"quiet_hours_end"?: string | null,"quiet_hours_start"?: string | null,"reminder_lead_minutes"?: number,"timezone"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string,"created_at": string,"deduplication_key": string,"deep_link": string,"id": string,"payload": NonNullable<Json>,"read_at": string | null,"title": string,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"deduplication_key": string,"deep_link": string,"id"?: string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"title": string,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"deduplication_key"?: string,"deep_link"?: string,"id"?: string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"title"?: string,"type"?: Database["public"]['Enums']["notification_type"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"failure_count": number,"id": string,"last_success_at": string | null,"p256dh": string,"user_agent": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"failure_count"?: number,"id"?: string,"last_success_at"?: string | null,"p256dh": string,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"failure_count"?: number,"id"?: string,"last_success_at"?: string | null,"p256dh"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limit_events": {
                  Row: {
                    "action": string,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rate_limit_events_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_events": {
                  Row: {
                    "created_at": string,"event_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_events_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saved_events_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_offers": {
                  Row: {
                    "affiliate_config": Json | null,"affiliate_provider": string | null,"currency": string | null,"destination_url": string | null,"event_id": string,"id": string,"is_resale": boolean,"last_verified_at": string,"link_generated_at": string | null,"max_price": number | null,"min_price": number | null,"offer_key": string,"offer_type": Database["public"]['Enums']["offer_type"],"provider": string,"provider_record_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "affiliate_config"?: Json | null,"affiliate_provider"?: string | null,"currency"?: string | null,"destination_url"?: string | null,"event_id": string,"id"?: string,"is_resale"?: boolean,"last_verified_at"?: string,"link_generated_at"?: string | null,"max_price"?: number | null,"min_price"?: number | null,"offer_key": string,"offer_type"?: Database["public"]['Enums']["offer_type"],"provider": string,"provider_record_id": string
                  }
                  Update: {
                    "affiliate_config"?: Json | null,"affiliate_provider"?: string | null,"currency"?: string | null,"destination_url"?: string | null,"event_id"?: string,"id"?: string,"is_resale"?: boolean,"last_verified_at"?: string,"link_generated_at"?: string | null,"max_price"?: number | null,"min_price"?: number | null,"offer_key"?: string,"offer_type"?: Database["public"]['Enums']["offer_type"],"provider"?: string,"provider_record_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_offers_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_offers_provider_record_id_fkey"
      columns: ["provider_record_id"]
isOneToOne: false
      referencedRelation: "event_provider_records"
      referencedColumns: ["id"]
    }
                  ]
                },"user_artists": {
                  Row: {
                    "added_source": Database["public"]['Enums']["artist_added_source"],"artist_id": string,"created_at": string,"id": string,"interest_level": Database["public"]['Enums']["interest_level"],"interest_source": Database["public"]['Enums']["interest_source"],"is_dismissed": boolean,"is_pinned": boolean,"long_time_fan_since": string | null,"notify_enabled": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_source": Database["public"]['Enums']["artist_added_source"],"artist_id": string,"created_at"?: string,"id"?: string,"interest_level"?: Database["public"]['Enums']["interest_level"],"interest_source"?: Database["public"]['Enums']["interest_source"],"is_dismissed"?: boolean,"is_pinned"?: boolean,"long_time_fan_since"?: string | null,"notify_enabled"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "added_source"?: Database["public"]['Enums']["artist_added_source"],"artist_id"?: string,"created_at"?: string,"id"?: string,"interest_level"?: Database["public"]['Enums']["interest_level"],"interest_source"?: Database["public"]['Enums']["interest_source"],"is_dismissed"?: boolean,"is_pinned"?: boolean,"long_time_fan_since"?: string | null,"notify_enabled"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_artists_artist_id_fkey"
      columns: ["artist_id"]
isOneToOne: false
      referencedRelation: "artists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_artists_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"user_blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"user_locations": {
                  Row: {
                    "city_id": string,"created_at": string,"id": string,"radius_km": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "city_id": string,"created_at"?: string,"id"?: string,"radius_km"?: number,"user_id": string
                  }
                  Update: {
                    "city_id"?: string,"created_at"?: string,"id"?: string,"radius_km"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_locations_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_locations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"users": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"default_intention_visibility": Database["public"]['Enums']["social_visibility"],"deleted_at": string | null,"display_name": string,"fan_list_visibility": Database["public"]['Enums']["social_visibility"],"home_location_id": string | null,"id": string,"onboarding_completed_at": string | null,"spotify_user_id": string | null,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"default_intention_visibility"?: Database["public"]['Enums']["social_visibility"],"deleted_at"?: string | null,"display_name"?: string,"fan_list_visibility"?: Database["public"]['Enums']["social_visibility"],"home_location_id"?: string | null,"id": string,"onboarding_completed_at"?: string | null,"spotify_user_id"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"default_intention_visibility"?: Database["public"]['Enums']["social_visibility"],"deleted_at"?: string | null,"display_name"?: string,"fan_list_visibility"?: Database["public"]['Enums']["social_visibility"],"home_location_id"?: string | null,"id"?: string,"onboarding_completed_at"?: string | null,"spotify_user_id"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "users_home_location_fk"
      columns: ["home_location_id"]
isOneToOne: false
      referencedRelation: "user_locations"
      referencedColumns: ["id"]
    }
                  ]
                },"venue_provider_ids": {
                  Row: {
                    "external_venue_id": string,"provider": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "external_venue_id": string,"provider": string,"venue_id": string
                  }
                  Update: {
                    "external_venue_id"?: string,"provider"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venue_provider_ids_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"venues": {
                  Row: {
                    "address": string | null,"city": string | null,"country_code": string | null,"created_at": string,"id": string,"latitude": number | null,"longitude": number | null,"name": string,"postal_code": string | null,"timezone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"city"?: string | null,"country_code"?: string | null,"created_at"?: string,"id"?: string,"latitude"?: number | null,"longitude"?: number | null,"name": string,"postal_code"?: string | null,"timezone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"city"?: string | null,"country_code"?: string | null,"created_at"?: string,"id"?: string,"latitude"?: number | null,"longitude"?: number | null,"name"?: string,"postal_code"?: string | null,"timezone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_friend_invite":
{ Args: { "p_token": string }; Returns: string
                           },
"apply_listening_insights":
{ Args: { "p_batch_id": string,"p_prune": boolean,"p_user_id": string }; Returns: Json
                           },
"are_friends":
{ Args: { "a": string,"b": string }; Returns: boolean
                           },
"artists_due_for_event_refresh":
{ Args: { "p_limit": number,"p_provider": string }; Returns: {
              "artist_id": string,"canonical_name": string,"external_artist_id": string
            }[]
                           },
"artists_needing_provider_lookup":
{ Args: { "p_limit": number,"p_provider": string }; Returns: {
              "artist_id": string,"canonical_name": string,"spotify_id": string
            }[]
                           },
"block_user":
{ Args: { "p_other": string }; Returns: undefined
                           },
"can_view_fan_list":
{ Args: { "owner": string,"viewer": string }; Returns: boolean
                           },
"claim_notification_jobs":
{ Args: { "p_limit": number }; Returns: {
              "actor_id": string | null,
"attempt_count": number,
"created_at": string,
"deduplication_key": string,
"delivered_at": string | null,
"event_id": string | null,
"id": string,
"last_error": string | null,
"locked_at": string | null,
"max_attempts": number,
"notification_type": Database["public"]['Enums']["notification_type"],
"sale_id": string | null,
"sale_starts_at_snapshot": string | null,
"scheduled_at": string,
"status": Database["public"]['Enums']["notification_job_status"],
"updated_at": string,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "notification_jobs"
        isOneToOne: false
        isSetofReturn: true
      } },
"claim_spotify_sync_accounts":
{ Args: { "p_limit": number }; Returns: {
              "access_token_encrypted": string | null,
"connected_at": string,
"expires_at": string | null,
"id": string,
"last_successful_sync_at": string | null,
"last_sync_attempt_at": string | null,
"last_sync_error": string | null,
"next_sync_at": string,
"provider": string,
"provider_user_id": string,
"refresh_token_encrypted": string | null,
"scopes": (string)[],
"status": Database["public"]['Enums']["connected_account_status"],
"sync_failure_count": number,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "connected_accounts"
        isOneToOne: false
        isSetofReturn: true
      } },
"complete_notification_job":
{ Args: { "p_body"?: string,"p_deep_link"?: string,"p_defer_until"?: string,"p_job_id": string,"p_outcome": string,"p_payload"?: Json,"p_reason"?: string,"p_title"?: string }; Returns: string
                           },
"create_friend_invite":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"distance_km":
{ Args: { "lat1": number,"lat2": number,"lon1": number,"lon2": number }; Returns: number
                           },
"enforce_rate_limit":
{ Args: { "p_action": string,"p_max": number,"p_window": string }; Returns: undefined
                           },
"ensure_spotify_artist":
{ Args: { "p_external_url": string,"p_genres": (string)[],"p_image_url": string,"p_name": string,"p_spotify_id": string }; Returns: string
                           },
"event_audience":
{ Args: { "p_event_id": string }; Returns: {
              "user_id": string
            }[]
                           },
"get_concert_search_status":
{ Args: Record<PropertyKey, never>; Returns: {
              "checked": number,"followed": number,"found": number,"last_run_at": string,"last_run_problem": string,"last_run_status": string,"refreshed": number,"running": boolean,"verified": number
            }[]
                           },
"get_event_friend_interests":
{ Args: { "p_event_id": string }; Returns: {
              "avatar_url": string,"display_name": string,"intention": Database["public"]['Enums']["event_intention"],"updated_at": string,"user_id": string
            }[]
                           },
"get_friend_activity":
{ Args: { "p_limit"?: number }; Returns: {
              "avatar_url": string,"display_name": string,"event_id": string,"intention": Database["public"]['Enums']["event_intention"],"updated_at": string,"user_id": string
            }[]
                           },
"get_friend_artist_suggestions":
{ Args: { "p_limit"?: number }; Returns: {
              "artist_id": string,"canonical_name": string,"friend_count": number,"image_url": string
            }[]
                           },
"get_friend_requests":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"created_at": string,"display_name": string,"friendship_id": string,"incoming": boolean,"other_id": string
            }[]
                           },
"get_friends":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"display_name": string,"friend_id": string,"shared_artist_count": number,"since": string
            }[]
                           },
"get_invite":
{ Args: { "p_token": string }; Returns: {
              "avatar_url": string,"display_name": string,"expired": boolean,"inviter_id": string
            }[]
                           },
"get_profiles":
{ Args: { "p_ids": (string)[] }; Returns: {
              "avatar_url": string,"display_name": string,"id": string
            }[]
                           },
"import_spotify_top_artists":
{ Args: { "p_batch_id": string,"p_items": Json,"p_user_id": string }; Returns: Json
                           },
"ingest_provider_event":
{ Args: { "p": Json }; Returns: Json
                           },
"is_blocked_between":
{ Args: { "a": string,"b": string }; Returns: boolean
                           },
"link_artist_provider":
{ Args: { "p_artist_id": string,"p_confidence": number,"p_external_id": string,"p_external_url": string,"p_method": Database["public"]['Enums']["match_method"],"p_provider": string }; Returns: undefined
                           },
"mark_artist_events_refreshed":
{ Args: { "p_artist_id": string }; Returns: undefined
                           },
"normalize_name":
{ Args: { "p_name": string }; Returns: string
                           },
"record_spotify_sync_result":
{ Args: { "p_account_id": string,"p_error": string,"p_revoked"?: boolean,"p_success": boolean }; Returns: undefined
                           },
"remove_friend":
{ Args: { "p_other": string }; Returns: undefined
                           },
"require_user":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"respond_friend_request":
{ Args: { "p_accept": boolean,"p_friendship_id": string }; Returns: undefined
                           },
"run_retention":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"schedule_event_notifications":
{ Args: { "p_changes"?: Json,"p_event_id": string,"p_is_new"?: boolean }; Returns: Json
                           },
"send_friend_request":
{ Args: { "p_recipient": string }; Returns: string
                           },
"trigger_notification_delivery":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"unblock_user":
{ Args: { "p_other": string }; Returns: undefined
                           }
          }
          Enums: {
            "artist_added_source": "spotify_import"|"manual"|"friend_suggestion"|"discovery","connected_account_status": "active"|"revoked"|"error","event_intention": "interested"|"going"|"looking_for_company","event_lifecycle_status": "announced"|"presale_scheduled"|"general_sale_scheduled"|"on_sale"|"offsale"|"postponed"|"rescheduled"|"cancelled"|"ended"|"unknown","friendship_status": "pending"|"accepted"|"declined","interest_level": "love"|"like"|"curious","interest_source": "auto"|"user","match_method": "provider_link"|"exact_name"|"manual","notification_job_status": "pending"|"processing"|"delivered"|"suppressed"|"failed"|"cancelled","notification_type": "presale_starting_soon"|"general_sale_starting_soon"|"sale_open"|"new_event"|"event_changed"|"friend_interest"|"friend_request","offer_type": "standard"|"vip"|"package"|"platinum"|"resale"|"other","sale_type": "presale"|"general"|"other","social_visibility": "friends"|"private","spotify_time_range": "short_term"|"medium_term"|"long_term"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "artist_added_source": ["spotify_import", "manual", "friend_suggestion", "discovery"],"connected_account_status": ["active", "revoked", "error"],"event_intention": ["interested", "going", "looking_for_company"],"event_lifecycle_status": ["announced", "presale_scheduled", "general_sale_scheduled", "on_sale", "offsale", "postponed", "rescheduled", "cancelled", "ended", "unknown"],"friendship_status": ["pending", "accepted", "declined"],"interest_level": ["love", "like", "curious"],"interest_source": ["auto", "user"],"match_method": ["provider_link", "exact_name", "manual"],"notification_job_status": ["pending", "processing", "delivered", "suppressed", "failed", "cancelled"],"notification_type": ["presale_starting_soon", "general_sale_starting_soon", "sale_open", "new_event", "event_changed", "friend_interest", "friend_request"],"offer_type": ["standard", "vip", "package", "platinum", "resale", "other"],"sale_type": ["presale", "general", "other"],"social_visibility": ["friends", "private"],"spotify_time_range": ["short_term", "medium_term", "long_term"]
          }
        }
} as const
