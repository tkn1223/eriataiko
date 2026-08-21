export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      competitions: {
        Row: {
          created_at: string;
          held_on: string;
          id: string;
          is_current: boolean;
          name: string;
        };
        Insert: {
          created_at?: string;
          held_on: string;
          id?: string;
          is_current?: boolean;
          name: string;
        };
        Update: {
          created_at?: string;
          held_on?: string;
          id?: string;
          is_current?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      divisions: {
        Row: {
          competition_id: string;
          created_at: string;
          display_order: number;
          id: string;
          name: string;
        };
        Insert: {
          competition_id: string;
          created_at?: string;
          display_order?: number;
          id?: string;
          name: string;
        };
        Update: {
          competition_id?: string;
          created_at?: string;
          display_order?: number;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'divisions_competition_id_fkey';
            columns: ['competition_id'];
            isOneToOne: false;
            referencedRelation: 'competitions';
            referencedColumns: ['id'];
          },
        ];
      };
      entries: {
        Row: {
          can_input: boolean;
          competition_id: string;
          created_at: string;
          division_id: string | null;
          id: string;
          player_id: string;
          team_id: string | null;
        };
        Insert: {
          can_input?: boolean;
          competition_id: string;
          created_at?: string;
          division_id?: string | null;
          id?: string;
          player_id: string;
          team_id?: string | null;
        };
        Update: {
          can_input?: boolean;
          competition_id?: string;
          created_at?: string;
          division_id?: string | null;
          id?: string;
          player_id?: string;
          team_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'entries_competition_id_fkey';
            columns: ['competition_id'];
            isOneToOne: false;
            referencedRelation: 'competitions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entries_division_id_fkey';
            columns: ['division_id'];
            isOneToOne: false;
            referencedRelation: 'divisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entries_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entries_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      games: {
        Row: {
          created_at: string;
          game_number: number;
          id: string;
          match_id: string;
          score_a: number;
          score_b: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          game_number: number;
          id?: string;
          match_id: string;
          score_a?: number;
          score_b?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          game_number?: number;
          id?: string;
          match_id?: string;
          score_a?: number;
          score_b?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'games_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: false;
            referencedRelation: 'matches';
            referencedColumns: ['id'];
          },
        ];
      };
      match_players: {
        Row: {
          created_at: string;
          entry_id: string;
          id: string;
          match_id: string;
          player_order: number;
          side: string;
        };
        Insert: {
          created_at?: string;
          entry_id: string;
          id?: string;
          match_id: string;
          player_order?: number;
          side: string;
        };
        Update: {
          created_at?: string;
          entry_id?: string;
          id?: string;
          match_id?: string;
          player_order?: number;
          side?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'match_players_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'entries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_players_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: false;
            referencedRelation: 'matches';
            referencedColumns: ['id'];
          },
        ];
      };
      matches: {
        Row: {
          court_number: number | null;
          created_at: string;
          division_id: string;
          finished_at: string | null;
          id: string;
          order_in_court: number | null;
          order_in_team_match: number;
          outcome: string;
          started_at: string | null;
          status: string;
          team_match_id: string;
        };
        Insert: {
          court_number?: number | null;
          created_at?: string;
          division_id: string;
          finished_at?: string | null;
          id?: string;
          order_in_court?: number | null;
          order_in_team_match?: number;
          outcome?: string;
          started_at?: string | null;
          status?: string;
          team_match_id: string;
        };
        Update: {
          court_number?: number | null;
          created_at?: string;
          division_id?: string;
          finished_at?: string | null;
          id?: string;
          order_in_court?: number | null;
          order_in_team_match?: number;
          outcome?: string;
          started_at?: string | null;
          status?: string;
          team_match_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'matches_division_id_fkey';
            columns: ['division_id'];
            isOneToOne: false;
            referencedRelation: 'divisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'matches_team_match_id_fkey';
            columns: ['team_match_id'];
            isOneToOne: false;
            referencedRelation: 'team_matches';
            referencedColumns: ['id'];
          },
        ];
      };
      operators: {
        Row: {
          created_at: string;
          display_order: number;
          id: string;
          is_active: boolean;
          name: string;
        };
        Insert: {
          created_at?: string;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          name: string;
        };
        Update: {
          created_at?: string;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      players: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          number: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          number: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          number?: number;
        };
        Relationships: [];
      };
      stages: {
        Row: {
          competition_id: string;
          created_at: string;
          display_order: number;
          id: string;
          kind: string;
          name: string;
        };
        Insert: {
          competition_id: string;
          created_at?: string;
          display_order?: number;
          id?: string;
          kind: string;
          name: string;
        };
        Update: {
          competition_id?: string;
          created_at?: string;
          display_order?: number;
          id?: string;
          kind?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stages_competition_id_fkey';
            columns: ['competition_id'];
            isOneToOne: false;
            referencedRelation: 'competitions';
            referencedColumns: ['id'];
          },
        ];
      };
      team_matches: {
        Row: {
          created_at: string;
          display_order: number;
          id: string;
          label: string;
          slot_a_label: string | null;
          slot_b_label: string | null;
          stage_id: string;
          team_a_id: string | null;
          team_b_id: string | null;
        };
        Insert: {
          created_at?: string;
          display_order?: number;
          id?: string;
          label: string;
          slot_a_label?: string | null;
          slot_b_label?: string | null;
          stage_id: string;
          team_a_id?: string | null;
          team_b_id?: string | null;
        };
        Update: {
          created_at?: string;
          display_order?: number;
          id?: string;
          label?: string;
          slot_a_label?: string | null;
          slot_b_label?: string | null;
          stage_id?: string;
          team_a_id?: string | null;
          team_b_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'team_matches_stage_id_fkey';
            columns: ['stage_id'];
            isOneToOne: false;
            referencedRelation: 'stages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_matches_team_a_id_fkey';
            columns: ['team_a_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_matches_team_b_id_fkey';
            columns: ['team_b_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      teams: {
        Row: {
          competition_id: string;
          created_at: string;
          display_order: number;
          id: string;
          name: string;
          number: number;
        };
        Insert: {
          competition_id: string;
          created_at?: string;
          display_order?: number;
          id?: string;
          name: string;
          number: number;
        };
        Update: {
          competition_id?: string;
          created_at?: string;
          display_order?: number;
          id?: string;
          name?: string;
          number?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'teams_competition_id_fkey';
            columns: ['competition_id'];
            isOneToOne: false;
            referencedRelation: 'competitions';
            referencedColumns: ['id'];
          },
        ];
      };
      write_logs: {
        Row: {
          action: string;
          created_at: string;
          detail: Json | null;
          id: number;
          operator_id: string | null;
          operator_name: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          detail?: Json | null;
          id?: never;
          operator_id?: string | null;
          operator_name: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          detail?: Json | null;
          id?: never;
          operator_id?: string | null;
          operator_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'write_logs_operator_id_fkey';
            columns: ['operator_id'];
            isOneToOne: false;
            referencedRelation: 'operators';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
