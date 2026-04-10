export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      Users: {
        Row: {
          id: string
          name: string
          handle_id: string
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          name: string
          handle_id: string
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          handle_id?: string
          avatar_url?: string | null
          created_at?: string
        }
      }
      Classes: {
        Row: {
          id: string
          name: string
          teacher: string | null
          room: string | null
          day_of_week: number
          period: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          teacher?: string | null
          room?: string | null
          day_of_week: number
          period: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          teacher?: string | null
          room?: string | null
          day_of_week?: number
          period?: number
          created_at?: string
        }
      }
      User_Classes: {
        Row: {
          id: string
          user_id: string
          class_id: string
          color: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          class_id: string
          color?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          class_id?: string
          color?: string | null
          created_at?: string
        }
      }
      Tasks: {
        Row: {
          id: string
          user_id: string
          class_id: string | null
          title: string
          deadline: string | null
          is_completed: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          class_id?: string | null
          title: string
          deadline?: string | null
          is_completed?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          class_id?: string | null
          title?: string
          deadline?: string | null
          is_completed?: boolean
          created_at?: string
        }
      }
      Follows: {
        Row: {
          follower_id: string
          followed_id: string
          created_at: string
        }
        Insert: {
          follower_id: string
          followed_id: string
          created_at?: string
        }
        Update: {
          follower_id?: string
          followed_id?: string
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
