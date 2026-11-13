export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      apartment_invites: {
        Row: {
          apartment_id: string;
          code_hash: string;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          revoked_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          apartment_id: string;
          code_hash: string;
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          id?: string;
          revoked_at?: string | null;
        };
        Update: {
          apartment_id?: string;
          code_hash?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'apartment_invites_apartment_id_fkey';
            columns: ['apartment_id'];
            isOneToOne: false;
            referencedRelation: 'apartments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'apartment_invites_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      apartment_members: {
        Row: {
          apartment_id: string;
          can_add_expense: boolean;
          id: string;
          joined_at: string;
          left_at: string | null;
          left_reason: string | null;
          role: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          apartment_id: string;
          can_add_expense?: boolean;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          left_reason?: string | null;
          role?: string;
          user_id: string;
        };
        Update: {
          apartment_id?: string;
          can_add_expense?: boolean;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          left_reason?: string | null;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'apartment_members_apartment_id_fkey';
            columns: ['apartment_id'];
            isOneToOne: false;
            referencedRelation: 'apartments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'apartment_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      apartments: {
        Row: {
          approval_days: number;
          created_at: string;
          created_by: string | null;
          currency: string;
          id: string;
          location: string | null;
          name: string;
          settlement_day: number;
          show_location: boolean;
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          approval_days?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          id?: string;
          location?: string | null;
          name: string;
          settlement_day: number;
          show_location?: boolean;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          approval_days?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          id?: string;
          location?: string | null;
          name?: string;
          settlement_day?: number;
          show_location?: boolean;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'apartments_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          apartment_id: string;
          created_at: string;
          details: NonNullable<Json>;
          entity_id: string | null;
          entity_type: string;
          id: number;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          apartment_id: string;
          created_at?: string;
          details?: NonNullable<Json>;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          apartment_id?: string;
          created_at?: string;
          details?: NonNullable<Json>;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_events_apartment_id_fkey';
            columns: ['apartment_id'];
            isOneToOne: false;
            referencedRelation: 'apartments';
            referencedColumns: ['id'];
          },
        ];
      };
      dispute_attachments: {
        Row: {
          content_type: string;
          created_at: string;
          dispute_id: string;
          id: string;
          storage_path: string;
          uploaded_by: string;
        };
        ComputedFields: never;
        Insert: {
          content_type: string;
          created_at?: string;
          dispute_id: string;
          id?: string;
          storage_path: string;
          uploaded_by: string;
        };
        Update: {
          content_type?: string;
          created_at?: string;
          dispute_id?: string;
          id?: string;
          storage_path?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'dispute_attachments_dispute_id_fkey';
            columns: ['dispute_id'];
            isOneToOne: false;
            referencedRelation: 'disputes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dispute_attachments_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      dispute_events: {
        Row: {
          action: string;
          actor_id: string;
          created_at: string;
          details: NonNullable<Json>;
          dispute_id: string;
          id: number;
          message: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id: string;
          created_at?: string;
          details?: NonNullable<Json>;
          dispute_id: string;
          id?: never;
          message?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string;
          created_at?: string;
          details?: NonNullable<Json>;
          dispute_id?: string;
          id?: never;
          message?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'dispute_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dispute_events_dispute_id_fkey';
            columns: ['dispute_id'];
            isOneToOne: false;
            referencedRelation: 'disputes';
            referencedColumns: ['id'];
          },
        ];
      };
      disputes: {
        Row: {
          apartment_id: string;
          client_request_id: string | null;
          created_at: string;
          expense_id: string | null;
          expense_revision: number | null;
          id: string;
          is_late: boolean;
          kind: string;
          proposed_share_minor: number;
          raised_by: string;
          reason: string;
          resolution: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          state: string;
          subject_type: string;
          window_remaining: string | null;
        };
        ComputedFields: never;
        Insert: {
          apartment_id: string;
          client_request_id?: string | null;
          created_at?: string;
          expense_id?: string | null;
          expense_revision?: number | null;
          id?: string;
          is_late: boolean;
          kind: string;
          proposed_share_minor: number;
          raised_by: string;
          reason: string;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          state?: string;
          subject_type?: string;
          window_remaining?: string | null;
        };
        Update: {
          apartment_id?: string;
          client_request_id?: string | null;
          created_at?: string;
          expense_id?: string | null;
          expense_revision?: number | null;
          id?: string;
          is_late?: boolean;
          kind?: string;
          proposed_share_minor?: number;
          raised_by?: string;
          reason?: string;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          state?: string;
          subject_type?: string;
          window_remaining?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'disputes_apartment_id_fkey';
            columns: ['apartment_id'];
            isOneToOne: false;
            referencedRelation: 'apartments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'disputes_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'disputes_raised_by_fkey';
            columns: ['raised_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'disputes_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      expense_attachments: {
        Row: {
          content_type: string;
          created_at: string;
          expense_id: string;
          id: string;
          storage_path: string;
          uploaded_by: string;
        };
        ComputedFields: never;
        Insert: {
          content_type: string;
          created_at?: string;
          expense_id: string;
          id?: string;
          storage_path: string;
          uploaded_by: string;
        };
        Update: {
          content_type?: string;
          created_at?: string;
          expense_id?: string;
          id?: string;
          storage_path?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'expense_attachments_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expense_attachments_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      expense_categories: {
        Row: {
          apartment_id: string;
          archived_at: string | null;
          created_at: string;
          id: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          apartment_id: string;
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          apartment_id?: string;
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'expense_categories_apartment_id_fkey';
            columns: ['apartment_id'];
            isOneToOne: false;
            referencedRelation: 'apartments';
            referencedColumns: ['id'];
          },
        ];
      };
      expense_payers: {
        Row: {
          amount_minor: number;
          expense_id: string;
          revision: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          expense_id: string;
          revision: number;
          user_id: string;
        };
        Update: {
          amount_minor?: number;
          expense_id?: string;
          revision?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'expense_payers_expense_id_revision_fkey';
            columns: ['expense_id', 'revision'];
            isOneToOne: false;
            referencedRelation: 'expense_revisions';
            referencedColumns: ['expense_id', 'revision'];
          },
          {
            foreignKeyName: 'expense_payers_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      expense_revisions: {
        Row: {
          amount_minor: number;
          created_at: string;
          created_by: string;
          expense_id: string;
          reason: string | null;
          revision: number;
          split_method: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          created_at?: string;
          created_by: string;
          expense_id: string;
          reason?: string | null;
          revision: number;
          split_method: string;
        };
        Update: {
          amount_minor?: number;
          created_at?: string;
          created_by?: string;
          expense_id?: string;
          reason?: string | null;
          revision?: number;
          split_method?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'expense_revisions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expense_revisions_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id'];
          },
        ];
      };
      expense_splits: {
        Row: {
          amount_minor: number;
          basis_points: number | null;
          expense_id: string;
          revision: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          basis_points?: number | null;
          expense_id: string;
          revision: number;
          user_id: string;
        };
        Update: {
          amount_minor?: number;
          basis_points?: number | null;
          expense_id?: string;
          revision?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'expense_splits_expense_id_revision_fkey';
            columns: ['expense_id', 'revision'];
            isOneToOne: false;
            referencedRelation: 'expense_revisions';
            referencedColumns: ['expense_id', 'revision'];
          },
          {
            foreignKeyName: 'expense_splits_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      expenses: {
        Row: {
          amount_minor: number;
          apartment_id: string;
          category_id: string | null;
          client_request_id: string | null;
          created_at: string;
          created_by: string;
          currency: string;
          description: string | null;
          due_date: string | null;
          expense_date: string;
          finalize_after: string;
          finalized_at: string | null;
          id: string;
          paid_status: string;
          revision: number;
          status: string;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          apartment_id: string;
          category_id?: string | null;
          client_request_id?: string | null;
          created_at?: string;
          created_by: string;
          currency: string;
          description?: string | null;
          due_date?: string | null;
          expense_date: string;
          finalize_after: string;
          finalized_at?: string | null;
          id?: string;
          paid_status: string;
          revision?: number;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          amount_minor?: number;
          apartment_id?: string;
          category_id?: string | null;
          client_request_id?: string | null;
          created_at?: string;
          created_by?: string;
          currency?: string;
          description?: string | null;
          due_date?: string | null;
          expense_date?: string;
          finalize_after?: string;
          finalized_at?: string | null;
          id?: string;
          paid_status?: string;
          revision?: number;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'expenses_apartment_id_fkey';
            columns: ['apartment_id'];
            isOneToOne: false;
            referencedRelation: 'apartments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'expense_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      ledger_entries: {
        Row: {
          amount_minor: number;
          apartment_id: string;
          created_at: string;
          creditor_id: string;
          debtor_id: string;
          expense_id: string | null;
          expense_revision: number | null;
          id: number;
          kind: string;
          offset_id: string | null;
          payment_id: string | null;
          reverses_entry_id: number | null;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          apartment_id: string;
          created_at?: string;
          creditor_id: string;
          debtor_id: string;
          expense_id?: string | null;
          expense_revision?: number | null;
          id?: never;
          kind: string;
          offset_id?: string | null;
          payment_id?: string | null;
          reverses_entry_id?: number | null;
        };
        Update: {
          amount_minor?: number;
          apartment_id?: string;
          created_at?: string;
          creditor_id?: string;
          debtor_id?: string;
          expense_id?: string | null;
          expense_revision?: number | null;
          id?: never;
          kind?: string;
          offset_id?: string | null;
          payment_id?: string | null;
          reverses_entry_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ledger_entries_apartment_id_fkey';
            columns: ['apartment_id'];
            isOneToOne: false;
            referencedRelation: 'apartments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_creditor_id_fkey';
            columns: ['creditor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_debtor_id_fkey';
            columns: ['debtor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_payment_fk';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_reverses_entry_id_fkey';
            columns: ['reverses_entry_id'];
            isOneToOne: false;
            referencedRelation: 'ledger_entries';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount_minor: number;
          apartment_id: string;
          client_request_id: string | null;
          created_at: string;
          currency: string;
          expense_id: string | null;
          finalize_after: string;
          finalized_at: string | null;
          id: string;
          paid_at: string;
          payer_id: string;
          recipient_id: string;
          reference: string | null;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          amount_minor: number;
          apartment_id: string;
          client_request_id?: string | null;
          created_at?: string;
          currency: string;
          expense_id?: string | null;
          finalize_after: string;
          finalized_at?: string | null;
          id?: string;
          paid_at: string;
          payer_id: string;
          recipient_id: string;
          reference?: string | null;
          status?: string;
        };
        Update: {
          amount_minor?: number;
          apartment_id?: string;
          client_request_id?: string | null;
          created_at?: string;
          currency?: string;
          expense_id?: string | null;
          finalize_after?: string;
          finalized_at?: string | null;
          id?: string;
          paid_at?: string;
          payer_id?: string;
          recipient_id?: string;
          reference?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_apartment_id_fkey';
            columns: ['apartment_id'];
            isOneToOne: false;
            referencedRelation: 'apartments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_payer_id_fkey';
            columns: ['payer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      expense_current_payers: {
        Row: {
          amount_minor: number;
          expense_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'expense_payers_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      expense_current_splits: {
        Row: {
          amount_minor: number;
          basis_points: number | null;
          expense_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'expense_splits_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      add_category: { Args: { p_apartment_id: string; p_name: string }; Returns: string };
      add_dispute_evidence: {
        Args: { p_dispute_id: string; p_storage_path: string };
        Returns: string;
      };
      add_expense_attachment: {
        Args: { p_expense_id: string; p_storage_path: string };
        Returns: string;
      };
      archive_category: { Args: { p_category_id: string }; Returns: undefined };
      create_apartment: {
        Args: {
          p_approval_days?: number;
          p_currency?: string;
          p_location?: string;
          p_name: string;
          p_settlement_day: number;
          p_show_location?: boolean;
          p_timezone?: string;
        };
        Returns: string;
      };
      create_invite: { Args: { p_apartment_id: string; p_valid_days?: number }; Returns: string };
      decide_dispute: {
        Args: { p_apply: boolean; p_dispute_id: string; p_message: string };
        Returns: undefined;
      };
      edit_expense: {
        Args: {
          p_amount_minor: number;
          p_category_id: string;
          p_description: string;
          p_due_date: string;
          p_expected_revision: number;
          p_expense_date: string;
          p_expense_id: string;
          p_participants: Json;
          p_payers: Json;
          p_reason?: string;
          p_split_method: string;
          p_title: string;
        };
        Returns: number;
      };
      get_my_balances: {
        Args: { p_apartment_id: string };
        Returns: {
          counterparty_id: string;
          disputed_minor: number;
          final_minor: number;
          provisional_minor: number;
        }[];
      };
      get_my_monthly_share: { Args: { p_apartment_id: string; p_month: string }; Returns: number };
      get_my_pair_balances: {
        Args: { p_apartment_id: string };
        Returns: {
          counterparty_id: string;
          owe_disputed_minor: number;
          owe_final_minor: number;
          owe_provisional_minor: number;
          owed_disputed_minor: number;
          owed_final_minor: number;
          owed_provisional_minor: number;
        }[];
      };
      get_my_pair_expenses: {
        Args: {
          p_apartment_id: string;
          p_counterparty_id: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          currency: string;
          expense_date: string;
          expense_id: string;
          owe_minor: number;
          owed_minor: number;
          paid_status: string;
          status: string;
          title: string;
        }[];
      };
      get_my_pair_obligations: {
        Args: { p_apartment_id: string; p_counterparty_id: string };
        Returns: {
          amount_minor: number;
          covered_minor: number;
          direction: string;
          expense_date: string;
          expense_id: string;
          is_held: boolean;
          title: string;
        }[];
      };
      join_apartment: { Args: { p_code: string }; Returns: Json };
      leave_apartment: { Args: { p_apartment_id: string }; Returns: undefined };
      post_expense: {
        Args: {
          p_amount_minor: number;
          p_apartment_id: string;
          p_category_id?: string;
          p_client_request_id?: string;
          p_description?: string;
          p_due_date?: string;
          p_expense_date: string;
          p_participants: Json;
          p_payers: Json;
          p_split_method: string;
          p_title: string;
        };
        Returns: string;
      };
      raise_dispute: {
        Args: {
          p_client_request_id?: string;
          p_expense_id: string;
          p_kind: string;
          p_proposed_share_minor?: number;
          p_reason: string;
        };
        Returns: string;
      };
      record_bill_payment: { Args: { p_expense_id: string; p_payers: Json }; Returns: undefined };
      record_payment: {
        Args: {
          p_amount_minor: number;
          p_apartment_id: string;
          p_client_request_id?: string;
          p_expense_id?: string;
          p_paid_at?: string;
          p_recipient_id: string;
          p_reference?: string;
        };
        Returns: string;
      };
      remove_member: { Args: { p_apartment_id: string; p_user_id: string }; Returns: undefined };
      rename_category: { Args: { p_category_id: string; p_name: string }; Returns: undefined };
      respond_to_dispute: {
        Args: { p_accept: boolean; p_dispute_id: string; p_message?: string };
        Returns: undefined;
      };
      revoke_invite: { Args: { p_invite_id: string }; Returns: undefined };
      set_member_can_add_expense: {
        Args: { p_allowed: boolean; p_apartment_id: string; p_user_id: string };
        Returns: undefined;
      };
      set_member_role: {
        Args: { p_apartment_id: string; p_role: string; p_user_id: string };
        Returns: undefined;
      };
      update_apartment_settings: {
        Args: {
          p_apartment_id: string;
          p_approval_days: number;
          p_location: string;
          p_name: string;
          p_settlement_day: number;
          p_show_location: boolean;
          p_timezone: string;
        };
        Returns: undefined;
      };
      void_expense: { Args: { p_expense_id: string; p_reason?: string }; Returns: undefined };
      withdraw_dispute: { Args: { p_dispute_id: string }; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
