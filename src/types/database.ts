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
          id: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          competition_id: string;
          created_at?: string;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          competition_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          sort_order?: number;
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
      game_scores: {
        Row: {
          created_at: string;
          game_number: number;
          id: string;
          match_id: string;
          side_a_score: number;
          side_b_score: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          game_number: number;
          id?: string;
          match_id: string;
          side_a_score?: number;
          side_b_score?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          game_number?: number;
          id?: string;
          match_id?: string;
          side_a_score?: number;
          side_b_score?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'game_scores_match_id_fkey';
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
          id: string;
          match_id: string;
          order_in_pair: number;
          participant_id: string;
          side: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          match_id: string;
          order_in_pair?: number;
          participant_id: string;
          side: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          match_id?: string;
          order_in_pair?: number;
          participant_id?: string;
          side?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'match_players_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: false;
            referencedRelation: 'matches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_players_participant_id_fkey';
            columns: ['participant_id'];
            isOneToOne: false;
            referencedRelation: 'participants';
            referencedColumns: ['id'];
          },
        ];
      };
      match_settings: {
        Row: {
          created_at: string;
          division_id: string;
          id: string;
          max_game_count: number;
          stage_id: string;
        };
        Insert: {
          created_at?: string;
          division_id: string;
          id?: string;
          max_game_count?: number;
          stage_id: string;
        };
        Update: {
          created_at?: string;
          division_id?: string;
          id?: string;
          max_game_count?: number;
          stage_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'match_settings_division_id_fkey';
            columns: ['division_id'];
            isOneToOne: false;
            referencedRelation: 'divisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_settings_stage_id_fkey';
            columns: ['stage_id'];
            isOneToOne: false;
            referencedRelation: 'stages';
            referencedColumns: ['id'];
          },
        ];
      };
      matches: {
        Row: {
          court_number: number | null;
          created_at: string;
          division_id: string;
          ending: string;
          finished_at: string | null;
          id: string;
          matchup_id: string;
          max_game_count: number;
          order_in_court: number | null;
          order_in_matchup: number;
          started_at: string | null;
          status: string;
        };
        Insert: {
          court_number?: number | null;
          created_at?: string;
          division_id: string;
          ending?: string;
          finished_at?: string | null;
          id?: string;
          matchup_id: string;
          max_game_count?: number;
          order_in_court?: number | null;
          order_in_matchup?: number;
          started_at?: string | null;
          status?: string;
        };
        Update: {
          court_number?: number | null;
          created_at?: string;
          division_id?: string;
          ending?: string;
          finished_at?: string | null;
          id?: string;
          matchup_id?: string;
          max_game_count?: number;
          order_in_court?: number | null;
          order_in_matchup?: number;
          started_at?: string | null;
          status?: string;
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
            foreignKeyName: 'matches_matchup_id_fkey';
            columns: ['matchup_id'];
            isOneToOne: false;
            referencedRelation: 'matchups';
            referencedColumns: ['id'];
          },
        ];
      };
      matchups: {
        Row: {
          created_at: string;
          id: string;
          round_name: string;
          side_a_slot_label: string | null;
          side_a_team_id: string | null;
          side_b_slot_label: string | null;
          side_b_team_id: string | null;
          sort_order: number;
          stage_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          round_name: string;
          side_a_slot_label?: string | null;
          side_a_team_id?: string | null;
          side_b_slot_label?: string | null;
          side_b_team_id?: string | null;
          sort_order?: number;
          stage_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          round_name?: string;
          side_a_slot_label?: string | null;
          side_a_team_id?: string | null;
          side_b_slot_label?: string | null;
          side_b_team_id?: string | null;
          sort_order?: number;
          stage_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'matchups_side_a_team_id_fkey';
            columns: ['side_a_team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'matchups_side_b_team_id_fkey';
            columns: ['side_b_team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'matchups_stage_id_fkey';
            columns: ['stage_id'];
            isOneToOne: false;
            referencedRelation: 'stages';
            referencedColumns: ['id'];
          },
        ];
      };
      participants: {
        Row: {
          competition_id: string;
          created_at: string;
          division_id: string | null;
          id: string;
          player_id: string;
          team_id: string | null;
        };
        Insert: {
          competition_id: string;
          created_at?: string;
          division_id?: string | null;
          id?: string;
          player_id: string;
          team_id?: string | null;
        };
        Update: {
          competition_id?: string;
          created_at?: string;
          division_id?: string | null;
          id?: string;
          player_id?: string;
          team_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'participants_competition_id_fkey';
            columns: ['competition_id'];
            isOneToOne: false;
            referencedRelation: 'competitions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'participants_division_id_fkey';
            columns: ['division_id'];
            isOneToOne: false;
            referencedRelation: 'divisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'participants_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'participants_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      players: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          player_number: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          player_number: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          player_number?: number;
        };
        Relationships: [];
      };
      stages: {
        Row: {
          competition_id: string;
          created_at: string;
          format: string;
          id: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          competition_id: string;
          created_at?: string;
          format: string;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          competition_id?: string;
          created_at?: string;
          format?: string;
          id?: string;
          name?: string;
          sort_order?: number;
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
      teams: {
        Row: {
          competition_id: string;
          created_at: string;
          id: string;
          name: string;
          sort_order: number;
          team_number: number;
        };
        Insert: {
          competition_id: string;
          created_at?: string;
          id?: string;
          name: string;
          sort_order?: number;
          team_number: number;
        };
        Update: {
          competition_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          sort_order?: number;
          team_number?: number;
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
          action_detail: Json | null;
          created_at: string;
          id: number;
          player_id: string | null;
          player_name: string;
        };
        Insert: {
          action: string;
          action_detail?: Json | null;
          created_at?: string;
          id?: never;
          player_id?: string | null;
          player_name: string;
        };
        Update: {
          action?: string;
          action_detail?: Json | null;
          created_at?: string;
          id?: never;
          player_id?: string | null;
          player_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'write_logs_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
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
