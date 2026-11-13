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
      [_ in never]: never;
    };
    Functions: {
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
      join_apartment: { Args: { p_code: string }; Returns: Json };
      revoke_invite: { Args: { p_invite_id: string }; Returns: undefined };
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
