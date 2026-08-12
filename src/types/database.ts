/**
 * Supabase のスキーマ型。
 *
 * ここは手書きせず、スキーマを変えたら再生成すること:
 *
 *   npm run db:types
 *
 * （初回は supabase/migrations を `npm run db:push` でクラウドに反映してから）
 * 下の内容は supabase/migrations/20260811000000_baseline.sql に対応する初期版。
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      operators: {
        Row: {
          id: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      write_logs: {
        Row: {
          id: number;
          operator_id: string | null;
          operator_name: string;
          action: string;
          detail: Json | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          operator_id?: string | null;
          operator_name: string;
          action: string;
          detail?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          operator_id?: string | null;
          operator_name?: string;
          action?: string;
          detail?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'write_logs_operator_id_fkey';
            columns: ['operator_id'];
            referencedRelation: 'operators';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
