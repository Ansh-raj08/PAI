/**
 * Supabase Client Configuration
 * Campus Safety System
 *
 * This file initializes a single Supabase client instance
 * that can be imported across all frontend modules.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Supabase credentials
const SUPABASE_URL = 'https://uiegcardebgogrkhimxv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpZWdjYXJkZWJnb2dya2hpbXh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MzI3MDEsImV4cCI6MjA4OTUwODcwMX0.R5Dxbcst1XbNOhRDFxMc_9x0ICZVzfjgAONAGYjqKJ8';

// Validate credentials
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[Supabase] Missing credentials. Check supabase-config.js');
    throw new Error('Supabase credentials not configured');
}

// Create single client instance
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Log successful initialization
console.log('[Supabase] Client initialized successfully');
console.log('[Supabase] Project:', SUPABASE_URL);

/**
 * Test connection to Supabase
 * Call this function to verify the client is working
 * @returns {Promise<{success: boolean, user: object|null, error: string|null}>}
 */
export async function testConnection() {
    console.log('[Supabase] Testing connection...');

    try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
            console.error('[Supabase] Connection test failed:', error.message);
            return { success: false, user: null, error: error.message };
        }

        console.log('[Supabase] Connection successful');
        console.log('[Supabase] Session:', data.session ? 'Active' : 'No active session');

        return {
            success: true,
            user: data.session?.user || null,
            error: null
        };
    } catch (err) {
        console.error('[Supabase] Connection error:', err.message);
        return { success: false, user: null, error: err.message };
    }
}
