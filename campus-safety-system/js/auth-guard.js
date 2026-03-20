/**
 * Auth Guard - Centralized Authentication System
 * Campus Safety System
 *
 * SINGLE SOURCE OF TRUTH for all auth operations.
 * NO auto-executing code - all functions must be explicitly called.
 */

import { supabase } from './supabase-config.js';

// ============================================================
// REDIRECT LOCK - Prevents redirect loops
// ============================================================
const REDIRECT_LOCK_KEY = 'auth_redirect_in_progress';
const REDIRECT_LOCK_TIMEOUT = 3000; // 3 seconds max

function isRedirectLocked() {
    const lock = sessionStorage.getItem(REDIRECT_LOCK_KEY);
    if (!lock) return false;

    const lockTime = parseInt(lock, 10);
    const now = Date.now();

    // Lock expired
    if (now - lockTime > REDIRECT_LOCK_TIMEOUT) {
        sessionStorage.removeItem(REDIRECT_LOCK_KEY);
        return false;
    }

    return true;
}

function setRedirectLock() {
    sessionStorage.setItem(REDIRECT_LOCK_KEY, Date.now().toString());
}

function clearRedirectLock() {
    sessionStorage.removeItem(REDIRECT_LOCK_KEY);
}

function safeRedirect(url) {
    if (isRedirectLocked()) {
        console.warn('[AuthGuard] Redirect blocked - already in progress');
        return false;
    }

    // Don't redirect if already on target page
    const currentPath = window.location.pathname;
    if (currentPath.endsWith(url) || currentPath.includes(url.replace('.html', ''))) {
        console.log('[AuthGuard] Already on target page:', url);
        clearRedirectLock();
        return false;
    }

    console.log('[AuthGuard] Redirecting to:', url);
    setRedirectLock();
    window.location.href = url;
    return true;
}

// ============================================================
// CORE AUTH FUNCTIONS
// ============================================================

/**
 * Get current authenticated user (from Supabase)
 * @returns {Promise<{user: object|null, error: object|null}>}
 */
export async function getUser() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error) {
            console.log('[AuthGuard] getUser error:', error.message);
            return { user: null, error };
        }

        return { user, error: null };
    } catch (err) {
        console.error('[AuthGuard] getUser exception:', err);
        return { user: null, error: err };
    }
}

/**
 * Get user profile from profiles table
 * @param {string} userId
 * @returns {Promise<{profile: object|null, error: object|null}>}
 */
export async function getProfile(userId) {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.log('[AuthGuard] getProfile error:', error.message);
            return { profile: null, error };
        }

        return { profile, error: null };
    } catch (err) {
        console.error('[AuthGuard] getProfile exception:', err);
        return { profile: null, error: err };
    }
}

/**
 * Get full auth state (user + profile)
 * @returns {Promise<{user: object|null, profile: object|null, isAuthenticated: boolean, role: string|null}>}
 */
export async function getAuthState() {
    console.log('[AuthGuard] Getting auth state...');

    const { user, error: userError } = await getUser();

    if (userError || !user) {
        console.log('[AuthGuard] No authenticated user');
        return { user: null, profile: null, isAuthenticated: false, role: null };
    }

    const { profile, error: profileError } = await getProfile(user.id);

    if (profileError || !profile) {
        console.log('[AuthGuard] No profile found for user');
        // User exists but no profile - treat as student by default
        return { user, profile: null, isAuthenticated: true, role: 'student' };
    }

    const role = profile.user_type || 'student';
    console.log('[AuthGuard] Auth state:', { email: user.email, role });

    return { user, profile, isAuthenticated: true, role };
}

// ============================================================
// PAGE GUARDS - Call these at the TOP of each page's script
// ============================================================

/**
 * Guard for pages that require ANY authenticated user
 * Redirects to login if not authenticated
 * @returns {Promise<{user: object, profile: object}|null>}
 */
export async function requireAuth() {
    console.log('[AuthGuard] requireAuth check...');

    const { user, profile, isAuthenticated } = await getAuthState();

    if (!isAuthenticated) {
        console.log('[AuthGuard] Not authenticated, redirecting to login');
        safeRedirect('login.html');
        return null;
    }

    clearRedirectLock();
    return { user, profile };
}

/**
 * Guard for STUDENT-ONLY pages (dashboard.html)
 * - Not authenticated → login
 * - Admin → admin-dashboard
 * - Student → allowed
 * @returns {Promise<{user: object, profile: object}|null>}
 */
export async function requireStudent() {
    console.log('[AuthGuard] requireStudent check...');

    const { user, profile, isAuthenticated, role } = await getAuthState();

    if (!isAuthenticated) {
        console.log('[AuthGuard] Not authenticated, redirecting to login');
        safeRedirect('login.html');
        return null;
    }

    if (role === 'admin') {
        console.log('[AuthGuard] User is admin, redirecting to admin dashboard');
        safeRedirect('admin-dashboard.html');
        return null;
    }

    console.log('[AuthGuard] Student access granted');
    clearRedirectLock();
    return { user, profile };
}

/**
 * Guard for ADMIN-ONLY pages (admin-dashboard.html)
 * - Not authenticated → login
 * - Student → dashboard
 * - Admin → allowed
 * @returns {Promise<{user: object, profile: object}|null>}
 */
export async function requireAdmin() {
    console.log('[AuthGuard] requireAdmin check...');

    const { user, profile, isAuthenticated, role } = await getAuthState();

    if (!isAuthenticated) {
        console.log('[AuthGuard] Not authenticated, redirecting to login');
        safeRedirect('login.html');
        return null;
    }

    if (role !== 'admin') {
        console.log('[AuthGuard] User is not admin, redirecting to student dashboard');
        safeRedirect('dashboard.html');
        return null;
    }

    console.log('[AuthGuard] Admin access granted');
    clearRedirectLock();
    return { user, profile };
}

/**
 * Guard for PUBLIC pages (login, signup, index)
 * If already authenticated, redirect to appropriate dashboard
 * @returns {Promise<boolean>} true if should show public page, false if redirecting
 */
export async function checkPublicPage() {
    console.log('[AuthGuard] checkPublicPage...');

    const { isAuthenticated, role } = await getAuthState();

    if (!isAuthenticated) {
        console.log('[AuthGuard] Not authenticated, showing public page');
        clearRedirectLock();
        return true; // Show public page
    }

    // User is authenticated, redirect to their dashboard
    console.log('[AuthGuard] User authenticated, redirecting to dashboard');

    if (role === 'admin') {
        safeRedirect('admin-dashboard.html');
    } else {
        safeRedirect('dashboard.html');
    }

    return false; // Will redirect
}

/**
 * Redirect authenticated user to their appropriate dashboard
 * @param {string} role - 'admin' or 'student'
 */
export function redirectToDashboard(role) {
    if (role === 'admin') {
        safeRedirect('admin-dashboard.html');
    } else {
        safeRedirect('dashboard.html');
    }
}

// ============================================================
// AUTH ACTIONS
// ============================================================

/**
 * Login user with email and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, user: object|null, error: string|null}>}
 */
export async function login(email, password) {
    console.log('[AuthGuard] Attempting login for:', email);

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            console.error('[AuthGuard] Login error:', error.message);
            return { success: false, user: null, error: error.message };
        }

        console.log('[AuthGuard] Login successful:', data.user.email);
        return { success: true, user: data.user, error: null };

    } catch (err) {
        console.error('[AuthGuard] Login exception:', err);
        return { success: false, user: null, error: err.message };
    }
}

/**
 * Signup new user (always creates student account)
 * @param {object} userData - { email, password, full_name, roll_number, phone }
 * @returns {Promise<{success: boolean, user: object|null, needsConfirmation: boolean, error: string|null}>}
 */
export async function signup(userData) {
    const { email, password, full_name, roll_number, phone } = userData;

    console.log('[AuthGuard] Attempting signup for:', email);

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name,
                    roll_number,
                    phone: phone || null
                    // user_type is set by database trigger to 'student'
                }
            }
        });

        if (error) {
            console.error('[AuthGuard] Signup error:', error.message);
            return { success: false, user: null, needsConfirmation: false, error: error.message };
        }

        // Check if email confirmation is required
        const needsConfirmation = data.user && !data.session;

        console.log('[AuthGuard] Signup successful, needs confirmation:', needsConfirmation);
        return { success: true, user: data.user, needsConfirmation, error: null };

    } catch (err) {
        console.error('[AuthGuard] Signup exception:', err);
        return { success: false, user: null, needsConfirmation: false, error: err.message };
    }
}

/**
 * Logout current user
 * @returns {Promise<boolean>}
 */
export async function logout() {
    console.log('[AuthGuard] Logging out...');

    try {
        const { error } = await supabase.auth.signOut();

        if (error) {
            console.error('[AuthGuard] Logout error:', error.message);
        }

        // Clear any stored state
        clearRedirectLock();

        console.log('[AuthGuard] Logout complete, redirecting to login');
        window.location.href = 'login.html';
        return true;

    } catch (err) {
        console.error('[AuthGuard] Logout exception:', err);
        window.location.href = 'login.html';
        return false;
    }
}

// ============================================================
// UTILITIES
// ============================================================

/**
 * Parse auth error into user-friendly message
 */
export function parseAuthError(errorMessage) {
    if (!errorMessage) return 'An error occurred';

    if (errorMessage.includes('Invalid login credentials')) {
        return 'Invalid email or password. Please try again.';
    }
    if (errorMessage.includes('Email not confirmed')) {
        return 'Please verify your email before logging in.';
    }
    if (errorMessage.includes('User already registered')) {
        return 'An account with this email already exists.';
    }
    if (errorMessage.includes('Password should be at least')) {
        return 'Password must be at least 6 characters.';
    }
    if (errorMessage.includes('rate limit')) {
        return 'Too many attempts. Please wait and try again.';
    }
    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        return 'Network error. Check your connection.';
    }

    return errorMessage;
}

/**
 * Check if email is valid format
 */
export function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Make logout available globally for onclick handlers
window.logout = logout;

console.log('[AuthGuard] Module loaded (no auto-execution)');
