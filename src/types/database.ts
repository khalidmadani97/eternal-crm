export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activities: {
        Row: {
          body: string | null
          business_id: string
          contact_id: string | null
          created_at: string
          id: string
          job_id: string | null
          kind: Database["public"]["Enums"]["activity_kind"]
          meta: Json | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          business_id?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kind: Database["public"]["Enums"]["activity_kind"]
          meta?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          business_id?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kind?: Database["public"]["Enums"]["activity_kind"]
          meta?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_allowances: {
        Row: {
          created_at: string
          extra_prompts: number
          monthly_prompts: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extra_prompts?: number
          monthly_prompts?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          extra_prompts?: number
          monthly_prompts?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_allowances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          completion_tokens: number | null
          created_at: string
          function_name: string
          id: string
          model: string | null
          prompt_tokens: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completion_tokens?: number | null
          created_at?: string
          function_name: string
          id?: string
          model?: string | null
          prompt_tokens?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completion_tokens?: number | null
          created_at?: string
          function_name?: string
          id?: string
          model?: string | null
          prompt_tokens?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          assigned_to: string | null
          business_id: string
          created_at: string
          ends_at: string | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["appt_kind"]
          notes: string | null
          starts_at: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          business_id?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          job_id: string
          kind: Database["public"]["Enums"]["appt_kind"]
          notes?: string | null
          starts_at: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          business_id?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          job_id?: string
          kind?: Database["public"]["Enums"]["appt_kind"]
          notes?: string | null
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          address: string | null
          business_id: string
          created_at: string
          default_tax_rate: number
          email: string | null
          hst_number: string | null
          name: string
          phone: string | null
          tagline: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id?: string
          created_at?: string
          default_tax_rate?: number
          email?: string | null
          hst_number?: string | null
          name?: string
          phone?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string
          default_tax_rate?: number
          email?: string | null
          hst_number?: string | null
          name?: string
          phone?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          suspended_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          suspended_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          suspended_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          activity_id: string
          answered_at: string | null
          business_id: string
          consent_announced: boolean
          contact_id: string
          created_at: string
          direction: Database["public"]["Enums"]["call_direction"]
          duration_seconds: number | null
          ended_at: string | null
          from_number: string
          id: string
          job_id: string | null
          notes: string | null
          outcome: Database["public"]["Enums"]["call_outcome"] | null
          provider_call_sid: string
          recording_path: string | null
          started_at: string | null
          to_number: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          answered_at?: string | null
          business_id?: string
          consent_announced?: boolean
          contact_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["call_direction"]
          duration_seconds?: number | null
          ended_at?: string | null
          from_number: string
          id?: string
          job_id?: string | null
          notes?: string | null
          outcome?: Database["public"]["Enums"]["call_outcome"] | null
          provider_call_sid: string
          recording_path?: string | null
          started_at?: string | null
          to_number: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          answered_at?: string | null
          business_id?: string
          consent_announced?: boolean
          contact_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["call_direction"]
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string
          id?: string
          job_id?: string | null
          notes?: string | null
          outcome?: Database["public"]["Enums"]["call_outcome"] | null
          provider_call_sid?: string
          recording_path?: string | null
          started_at?: string | null
          to_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: true
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_identities: {
        Row: {
          business_id: string
          contact_id: string
          created_at: string
          display_name: string | null
          external_id: string
          id: string
          platform: Database["public"]["Enums"]["dm_platform"]
          updated_at: string
        }
        Insert: {
          business_id?: string
          contact_id: string
          created_at?: string
          display_name?: string | null
          external_id: string
          id?: string
          platform: Database["public"]["Enums"]["dm_platform"]
          updated_at?: string
        }
        Update: {
          business_id?: string
          contact_id?: string
          created_at?: string
          display_name?: string | null
          external_id?: string
          id?: string
          platform?: Database["public"]["Enums"]["dm_platform"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_identities_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_identities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          business_id: string
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          type: Database["public"]["Enums"]["company_type"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          type: Database["public"]["Enums"]["company_type"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          type?: Database["public"]["Enums"]["company_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          business_id: string
          channel: Database["public"]["Enums"]["consent_channel"]
          contact_id: string
          created_at: string
          evidence: Json | null
          expires_at: string | null
          granted_at: string | null
          id: string
          phone_number: string
          source: string
          status: Database["public"]["Enums"]["consent_status"]
          updated_at: string
          withdrawn_at: string | null
        }
        Insert: {
          business_id?: string
          channel: Database["public"]["Enums"]["consent_channel"]
          contact_id: string
          created_at?: string
          evidence?: Json | null
          expires_at?: string | null
          granted_at?: string | null
          id?: string
          phone_number: string
          source: string
          status: Database["public"]["Enums"]["consent_status"]
          updated_at?: string
          withdrawn_at?: string | null
        }
        Update: {
          business_id?: string
          channel?: Database["public"]["Enums"]["consent_channel"]
          contact_id?: string
          created_at?: string
          evidence?: Json | null
          expires_at?: string | null
          granted_at?: string | null
          id?: string
          phone_number?: string
          source?: string
          status?: Database["public"]["Enums"]["consent_status"]
          updated_at?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          auto_created: boolean
          business_id: string
          city: string | null
          company_id: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          extra: Json
          full_name: string
          id: string
          last_contact_detail: string | null
          last_contact_method: string | null
          last_contacted_at: string | null
          last_contacted_by: string | null
          lead_source: string | null
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          auto_created?: boolean
          business_id?: string
          city?: string | null
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          extra?: Json
          full_name: string
          id?: string
          last_contact_detail?: string | null
          last_contact_method?: string | null
          last_contacted_at?: string | null
          last_contacted_by?: string | null
          lead_source?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          auto_created?: boolean
          business_id?: string
          city?: string | null
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          extra?: Json
          full_name?: string
          id?: string
          last_contact_detail?: string | null
          last_contact_method?: string | null
          last_contacted_at?: string | null
          last_contacted_by?: string | null
          lead_source?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_last_contacted_by_fkey"
            columns: ["last_contacted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          body_snapshot: string
          business_id: string
          created_at: string
          id: string
          job_id: string
          sent_at: string | null
          sign_token: string | null
          signature_image_path: string | null
          signed_at: string | null
          signed_pdf_path: string | null
          signer_email: string | null
          signer_ip: unknown
          signer_name: string | null
          status: Database["public"]["Enums"]["contract_status"]
          template_version: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          body_snapshot: string
          business_id?: string
          created_at?: string
          id?: string
          job_id: string
          sent_at?: string | null
          sign_token?: string | null
          signature_image_path?: string | null
          signed_at?: string | null
          signed_pdf_path?: string | null
          signer_email?: string | null
          signer_ip?: unknown
          signer_name?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          template_version: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          body_snapshot?: string
          business_id?: string
          created_at?: string
          id?: string
          job_id?: string
          sent_at?: string | null
          sign_token?: string | null
          signature_image_path?: string | null
          signed_at?: string | null
          signed_pdf_path?: string | null
          signer_email?: string | null
          signer_ip?: unknown
          signer_name?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          template_version?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_messages: {
        Row: {
          activity_id: string
          body: string | null
          business_id: string
          contact_id: string
          created_at: string
          direction: Database["public"]["Enums"]["call_direction"]
          external_id: string
          id: string
          job_id: string | null
          platform: Database["public"]["Enums"]["dm_platform"]
          provider_message_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          body?: string | null
          business_id?: string
          contact_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["call_direction"]
          external_id: string
          id?: string
          job_id?: string | null
          platform: Database["public"]["Enums"]["dm_platform"]
          provider_message_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          body?: string | null
          business_id?: string
          contact_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["call_direction"]
          external_id?: string
          id?: string
          job_id?: string | null
          platform?: Database["public"]["Enums"]["dm_platform"]
          provider_message_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_messages_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: true
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_messages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      document_counters: {
        Row: {
          business_id: string
          last_value: number
          prefix: string
          year: number
        }
        Insert: {
          business_id: string
          last_value?: number
          prefix: string
          year: number
        }
        Update: {
          business_id?: string
          last_value?: number
          prefix?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_counters_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          business_id: string
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          created_by: string | null
          description: string | null
          hst_amount: number
          id: string
          incurred_at: string
          job_id: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          receipt_path: string | null
          reference: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount: number
          business_id?: string
          category: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          hst_amount?: number
          id?: string
          incurred_at?: string
          job_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          receipt_path?: string | null
          reference?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          business_id?: string
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          hst_amount?: number
          id?: string
          incurred_at?: string
          job_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          receipt_path?: string | null
          reference?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          business_id: string
          created_at: string
          filename: string | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["file_kind"]
          size_bytes: number | null
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          business_id?: string
          created_at?: string
          filename?: string | null
          id?: string
          job_id: string
          kind: Database["public"]["Enums"]["file_kind"]
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          filename?: string | null
          id?: string
          job_id?: string
          kind?: Database["public"]["Enums"]["file_kind"]
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "files_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_leads: {
        Row: {
          business_id: string
          contact_id: string | null
          converted_at: string | null
          created_at: string
          dedupe_key: string | null
          discarded_at: string | null
          id: string
          job_id: string | null
          parse_error: string | null
          parsed_email: string | null
          parsed_message: string | null
          parsed_name: string | null
          parsed_phone: string | null
          provider: Database["public"]["Enums"]["lead_provider"]
          raw_payload: Json
          received_at: string
          updated_at: string
        }
        Insert: {
          business_id?: string
          contact_id?: string | null
          converted_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          discarded_at?: string | null
          id?: string
          job_id?: string | null
          parse_error?: string | null
          parsed_email?: string | null
          parsed_message?: string | null
          parsed_name?: string | null
          parsed_phone?: string | null
          provider: Database["public"]["Enums"]["lead_provider"]
          raw_payload: Json
          received_at?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          contact_id?: string | null
          converted_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          discarded_at?: string | null
          id?: string
          job_id?: string | null
          parse_error?: string | null
          parsed_email?: string | null
          parsed_message?: string | null
          parsed_name?: string | null
          parsed_phone?: string | null
          provider?: Database["public"]["Enums"]["lead_provider"]
          raw_payload?: Json
          received_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_leads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_leads_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          business_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["user_role"]
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          business_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          token: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          business_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          amount: number | null
          business_id: string
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          position: number
          quantity: number | null
          unit: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          business_id?: string
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          position: number
          quantity?: number | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          business_id?: string
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          position?: number
          quantity?: number | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          business_id: string
          contract_id: string | null
          created_at: string
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string | null
          job_id: string
          paid_at: string | null
          quote_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          stripe_payment_link: string | null
          subtotal: number | null
          tax_amount: number | null
          tax_rate: number | null
          total: number | null
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          amount_paid?: number
          business_id?: string
          contract_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string | null
          job_id: string
          paid_at?: string | null
          quote_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_payment_link?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          total?: number | null
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          amount_paid?: number
          business_id?: string
          contract_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string | null
          job_id?: string
          paid_at?: string | null
          quote_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_payment_link?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          total?: number | null
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          assigned_to: string | null
          business_id: string
          city: string | null
          close_grade: number | null
          company_id: string | null
          contact_id: string
          created_at: string
          deleted_at: string | null
          extra: Json
          id: string
          job_number: string
          lead_source: string | null
          lost_at: string | null
          lost_reason: string | null
          margin_grade: number | null
          pipeline_id: string | null
          site_address: string | null
          stage: Database["public"]["Enums"]["job_stage"]
          title: string
          updated_at: string
          value_est: number | null
          value_final: number | null
          won_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          business_id?: string
          city?: string | null
          close_grade?: number | null
          company_id?: string | null
          contact_id: string
          created_at?: string
          deleted_at?: string | null
          extra?: Json
          id?: string
          job_number: string
          lead_source?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          margin_grade?: number | null
          pipeline_id?: string | null
          site_address?: string | null
          stage?: Database["public"]["Enums"]["job_stage"]
          title: string
          updated_at?: string
          value_est?: number | null
          value_final?: number | null
          won_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          business_id?: string
          city?: string | null
          close_grade?: number | null
          company_id?: string | null
          contact_id?: string
          created_at?: string
          deleted_at?: string | null
          extra?: Json
          id?: string
          job_number?: string
          lead_source?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          margin_grade?: number | null
          pipeline_id?: string | null
          site_address?: string | null
          stage?: Database["public"]["Enums"]["job_stage"]
          title?: string
          updated_at?: string
          value_est?: number | null
          value_final?: number | null
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sheets: {
        Row: {
          active: boolean
          business_id: string
          column_map: Json | null
          created_at: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          name: string
          provider: Database["public"]["Enums"]["lead_provider"]
          rows_imported: number
          sheet_url: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id?: string
          column_map?: Json | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          name: string
          provider?: Database["public"]["Enums"]["lead_provider"]
          rows_imported?: number
          sheet_url: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          column_map?: Json | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          name?: string
          provider?: Database["public"]["Enums"]["lead_provider"]
          rows_imported?: number
          sheet_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sheets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          activity_id: string
          body: string | null
          business_id: string
          contact_id: string
          created_at: string
          delivered_at: string | null
          direction: Database["public"]["Enums"]["call_direction"]
          error_code: string | null
          from_number: string
          id: string
          job_id: string | null
          media_paths: string[] | null
          provider_message_sid: string
          sent_at: string | null
          status: Database["public"]["Enums"]["message_status"]
          to_number: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          body?: string | null
          business_id?: string
          contact_id: string
          created_at?: string
          delivered_at?: string | null
          direction: Database["public"]["Enums"]["call_direction"]
          error_code?: string | null
          from_number: string
          id?: string
          job_id?: string | null
          media_paths?: string[] | null
          provider_message_sid: string
          sent_at?: string | null
          status: Database["public"]["Enums"]["message_status"]
          to_number: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          body?: string | null
          business_id?: string
          contact_id?: string
          created_at?: string
          delivered_at?: string | null
          direction?: Database["public"]["Enums"]["call_direction"]
          error_code?: string | null
          from_number?: string
          id?: string
          job_id?: string | null
          media_paths?: string[] | null
          provider_message_sid?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          to_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: true
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      option_items: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          id: string
          list_key: string
          position: number
          updated_at: string
          value: string
        }
        Insert: {
          active?: boolean
          business_id?: string
          created_at?: string
          id?: string
          list_key: string
          position?: number
          updated_at?: string
          value: string
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          id?: string
          list_key?: string
          position?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          id: string
          invoice_id: string | null
          job_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          method: Database["public"]["Enums"]["payment_method"]
          received_at: string
          reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          business_id?: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          job_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          method: Database["public"]["Enums"]["payment_method"]
          received_at: string
          reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          job_id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          method?: Database["public"]["Enums"]["payment_method"]
          received_at?: string
          reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_actions: {
        Row: {
          business_id: string
          confirm_phrase: string
          created_at: string
          executed_at: string | null
          expires_at: string
          id: string
          kind: string
          patch: Json
          requested_by: string
          status: string
          summary: string
          targets: Json
          updated_at: string
        }
        Insert: {
          business_id: string
          confirm_phrase: string
          created_at?: string
          executed_at?: string | null
          expires_at?: string
          id?: string
          kind: string
          patch: Json
          requested_by: string
          status?: string
          summary: string
          targets: Json
          updated_at?: string
        }
        Update: {
          business_id?: string
          confirm_phrase?: string
          created_at?: string
          executed_at?: string | null
          expires_at?: string
          id?: string
          kind?: string
          patch?: Json
          requested_by?: string
          status?: string
          summary?: string
          targets?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_actions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_actions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          business_id?: string
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_business_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          job_role: string | null
          phone: string | null
          platform_admin: boolean
          responsibilities: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active_business_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          job_role?: string | null
          phone?: string | null
          platform_admin?: boolean
          responsibilities?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active_business_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          job_role?: string | null
          phone?: string | null
          platform_admin?: boolean
          responsibilities?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_business_id_fkey"
            columns: ["active_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_line_items: {
        Row: {
          amount: number | null
          business_id: string
          created_at: string
          description: string | null
          id: string
          position: number
          quantity: number | null
          quote_id: string
          unit: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          business_id?: string
          created_at?: string
          description?: string | null
          id?: string
          position: number
          quantity?: number | null
          quote_id: string
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          business_id?: string
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          quantity?: number | null
          quote_id?: string
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_line_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_line_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          body_snapshot: Json | null
          business_id: string
          created_at: string
          design_quote_id: string | null
          id: string
          job_id: string
          quote_number: string
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number | null
          tax_amount: number | null
          tax_rate: number | null
          total: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          body_snapshot?: Json | null
          business_id?: string
          created_at?: string
          design_quote_id?: string | null
          id?: string
          job_id: string
          quote_number: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          total?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          body_snapshot?: Json | null
          business_id?: string
          created_at?: string
          design_quote_id?: string | null
          id?: string
          job_id?: string
          quote_number?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          total?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_settings: {
        Row: {
          business_id: string
          created_at: string
          hidden: boolean
          id: string
          label: string
          phase: string
          pipeline_id: string | null
          position: number
          stage: Database["public"]["Enums"]["job_stage"]
          updated_at: string
        }
        Insert: {
          business_id?: string
          created_at?: string
          hidden?: boolean
          id?: string
          label: string
          phase?: string
          pipeline_id?: string | null
          position: number
          stage: Database["public"]["Enums"]["job_stage"]
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          hidden?: boolean
          id?: string
          label?: string
          phase?: string
          pipeline_id?: string | null
          position?: number
          stage?: Database["public"]["Enums"]["job_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_settings_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          business_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          estimated_minutes: number | null
          id: string
          job_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          business_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimated_minutes?: number | null
          id?: string
          job_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          business_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimated_minutes?: number | null
          id?: string
          job_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_member_by_email: {
        Args: {
          p_email: string
          p_role?: Database["public"]["Enums"]["user_role"]
        }
        Returns: undefined
      }
      convert_quote_to_invoice: {
        Args: { p_quote_id: string }
        Returns: string
      }
      create_client_business: {
        Args: { p_admin_email?: string; p_name: string }
        Returns: string
      }
      create_invoice: {
        Args: { p_job_id: string; p_tax_rate?: number }
        Returns: string
      }
      create_pipeline: { Args: { p_name: string }; Returns: string }
      current_business: { Args: never; Returns: string }
      delete_file: { Args: { p_file_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      log_contact: {
        Args: {
          p_at?: string
          p_by?: string
          p_contact_id: string
          p_detail?: string
          p_method: string
          p_note?: string
        }
        Returns: undefined
      }
      my_business_ids: { Args: never; Returns: string[] }
      next_document_number: { Args: { p_prefix: string }; Returns: string }
      next_document_number_for: {
        Args: { p_business: string; p_prefix: string }
        Returns: string
      }
      recompute_invoice_paid: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      record_call: {
        Args: {
          p_answered_at?: string
          p_body?: string
          p_consent_announced?: boolean
          p_contact_id: string
          p_direction: Database["public"]["Enums"]["call_direction"]
          p_duration_seconds?: number
          p_ended_at?: string
          p_from_number: string
          p_job_id?: string
          p_outcome?: Database["public"]["Enums"]["call_outcome"]
          p_provider_call_sid: string
          p_recording_path?: string
          p_started_at?: string
          p_to_number: string
        }
        Returns: string
      }
      record_dm: {
        Args: {
          p_body?: string
          p_contact_id: string
          p_direction: Database["public"]["Enums"]["call_direction"]
          p_external_id: string
          p_job_id?: string
          p_platform: Database["public"]["Enums"]["dm_platform"]
          p_provider_message_id: string
        }
        Returns: string
      }
      record_message: {
        Args: {
          p_body?: string
          p_contact_id: string
          p_delivered_at?: string
          p_direction: Database["public"]["Enums"]["call_direction"]
          p_error_code?: string
          p_from_number: string
          p_job_id?: string
          p_media_paths?: string[]
          p_provider_message_sid: string
          p_sent_at?: string
          p_status: Database["public"]["Enums"]["message_status"]
          p_to_number: string
        }
        Returns: string
      }
      register_business: { Args: { p_name: string }; Returns: string }
      seed_business_defaults: {
        Args: { p_name: string; v_business: string }
        Returns: undefined
      }
      seed_pipeline_stages: {
        Args: { v_business: string; v_pipeline: string }
        Returns: undefined
      }
      set_active_business: { Args: { p_business: string }; Returns: undefined }
      set_business_suspended: {
        Args: { p_business_id: string; p_suspend: boolean }
        Returns: undefined
      }
      touch_last_contacted: {
        Args: {
          p_at: string
          p_by: string
          p_contact_id: string
          p_detail: string
          p_method: string
        }
        Returns: undefined
      }
      void_invoice: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      activity_kind:
        | "note"
        | "call"
        | "sms"
        | "email"
        | "meeting"
        | "stage_change"
        | "system"
        | "dm"
      appt_kind: "consultation" | "template" | "install" | "service" | "pickup"
      call_direction: "inbound" | "outbound"
      call_outcome: "connected" | "no_answer" | "voicemail" | "busy" | "failed"
      company_type:
        | "builder"
        | "designer"
        | "general_contractor"
        | "supplier"
        | "other"
      consent_channel: "sms" | "call_recording"
      consent_status: "express" | "implied" | "withdrawn"
      contract_status: "draft" | "sent" | "signed" | "declined" | "void"
      dm_platform: "messenger" | "instagram"
      expense_category:
        | "materials"
        | "subcontractor"
        | "labour"
        | "equipment"
        | "disposal"
        | "permits"
        | "fuel"
        | "marketing"
        | "office"
        | "rent"
        | "insurance"
        | "software"
        | "other"
      file_kind:
        | "measure"
        | "drawing"
        | "slab_photo"
        | "site_photo"
        | "contract"
        | "invoice"
        | "other"
      invoice_status: "draft" | "sent" | "partial" | "paid" | "void"
      job_stage:
        | "new"
        | "contacted"
        | "quoted"
        | "follow_up"
        | "won"
        | "templated"
        | "fabrication"
        | "scheduled"
        | "installed"
        | "closed"
        | "lost"
        | "custom_1"
        | "custom_2"
        | "custom_3"
        | "custom_4"
        | "custom_5"
        | "custom_6"
      lead_provider:
        | "website"
        | "meta"
        | "google_ads"
        | "google_lsa"
        | "zapier"
        | "manual"
        | "other"
      message_status: "queued" | "sent" | "delivered" | "failed" | "received"
      payment_kind: "deposit" | "progress" | "final" | "refund"
      payment_method: "etransfer" | "cheque" | "cash" | "card" | "other"
      quote_status: "draft" | "sent" | "accepted" | "declined" | "expired"
      user_role: "admin" | "staff"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_kind: [
        "note",
        "call",
        "sms",
        "email",
        "meeting",
        "stage_change",
        "system",
        "dm",
      ],
      appt_kind: ["consultation", "template", "install", "service", "pickup"],
      call_direction: ["inbound", "outbound"],
      call_outcome: ["connected", "no_answer", "voicemail", "busy", "failed"],
      company_type: [
        "builder",
        "designer",
        "general_contractor",
        "supplier",
        "other",
      ],
      consent_channel: ["sms", "call_recording"],
      consent_status: ["express", "implied", "withdrawn"],
      contract_status: ["draft", "sent", "signed", "declined", "void"],
      dm_platform: ["messenger", "instagram"],
      expense_category: [
        "materials",
        "subcontractor",
        "labour",
        "equipment",
        "disposal",
        "permits",
        "fuel",
        "marketing",
        "office",
        "rent",
        "insurance",
        "software",
        "other",
      ],
      file_kind: [
        "measure",
        "drawing",
        "slab_photo",
        "site_photo",
        "contract",
        "invoice",
        "other",
      ],
      invoice_status: ["draft", "sent", "partial", "paid", "void"],
      job_stage: [
        "new",
        "contacted",
        "quoted",
        "follow_up",
        "won",
        "templated",
        "fabrication",
        "scheduled",
        "installed",
        "closed",
        "lost",
        "custom_1",
        "custom_2",
        "custom_3",
        "custom_4",
        "custom_5",
        "custom_6",
      ],
      lead_provider: [
        "website",
        "meta",
        "google_ads",
        "google_lsa",
        "zapier",
        "manual",
        "other",
      ],
      message_status: ["queued", "sent", "delivered", "failed", "received"],
      payment_kind: ["deposit", "progress", "final", "refund"],
      payment_method: ["etransfer", "cheque", "cash", "card", "other"],
      quote_status: ["draft", "sent", "accepted", "declined", "expired"],
      user_role: ["admin", "staff"],
    },
  },
} as const

