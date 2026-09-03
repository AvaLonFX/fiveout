import { createClient } from '@supabase/supabase-js';

// Supabase URL i javni API ključ (pronađite ih na Supabase Dashboard > Settings > API)
const supabaseUrl = 'https://fdlcdiqvbldqwjbbdjhv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkbGNkaXF2YmxkcXdqYmJkamh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNzQwNTcsImV4cCI6MjA3ODY1MDA1N30._ZYUsn03GY-Co6gKNCJCovjvrMkxewilL9tzYGP8jWM';

export const supabase = createClient(supabaseUrl, supabaseKey);
