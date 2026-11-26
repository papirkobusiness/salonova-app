import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const configured = Boolean(url && key)
export const supabase = configured ? createClient(url!, key!) : null

export type Salon = { id:string; name:string; slug:string; timezone:string; public_views?:number }
export type Booking = { id:string; client_name:string; service:string|null; booking_date:string; booking_time:string; status:string; phone:string|null; stylist:string|null; channel?:string }
export type Service = { id:string; name:string; duration_minutes:number; price:number; is_active:boolean }
export type Staff = { id:string; name:string; email:string|null; phone:string|null; is_active:boolean }
export type Conversation = { id:string; channel:string; customer_name:string|null; title:string|null; status:string; updated_at:string }
