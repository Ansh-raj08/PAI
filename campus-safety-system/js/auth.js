/**
 * Auth Forms - Login & Signup Form Handlers
 * Campus Safety System
 *
 * This file ONLY handles form submission logic.
 * All auth state management is in auth-guard.js
 */

import {
    checkPublicPage,
    login,
    signup,
    redirectToDashboard,
    getProfile,
    parseAuthError,
    isValidEmail
} from './auth-guard.js';

console.log('[AuthForms] Module loaded');

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[AuthForms] Initializing...');

    const currentPath = window.location.pathname;
    const isLoginPage = currentPath.includes('login.html');
    const isSignupPage = currentPath.includes('signup.html');

    // Check if user is already logged in (redirect away from auth pages)
    const shouldShowPage = await checkPublicPage();

    if (!shouldShowPage) {
        console.log('[AuthForms] User authenticated, redirecting...');
        return; // Will redirect
    }

    // Initialize appropriate form
    if (isLoginPage) {
        initLoginForm();
    } else if (isSignupPage) {
        initSignupForm();
    }

    console.log('[AuthForms] Ready');
});

// ============================================================
// LOGIN FORM
// ============================================================

function initLoginForm() {
    console.log('[AuthForms] Initializing login form');

    const form = document.getElementById('loginForm');
    const errorEl = document.getElementById('errorMessage');
    const submitBtn = document.getElementById('submitBtn');

    if (!form) {
        console.error('[AuthForms] Login form not found');
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (submitBtn.disabled) return;

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        // Validation
        if (!email || !password) {
            showError(errorEl, 'Please fill in all fields');
            return;
        }

        if (!isValidEmail(email)) {
            showError(errorEl, 'Please enter a valid email');
            return;
        }

        // Loading state
        setLoading(submitBtn, true, 'Logging in...');
        hideMessage(errorEl);

        // Attempt login
        const { success, user, error } = await login(email, password);

        if (!success) {
            showError(errorEl, parseAuthError(error));
            setLoading(submitBtn, false, 'Login');
            return;
        }

        // Success - get profile to determine role
        showSuccess(errorEl, 'Login successful! Redirecting...');

        const { profile } = await getProfile(user.id);
        const role = profile?.user_type || 'student';

        // Redirect to appropriate dashboard
        redirectToDashboard(role);
    });
}

// ============================================================
// SIGNUP FORM
// ============================================================

function initSignupForm() {
    console.log('[AuthForms] Initializing signup form');

    const form = document.getElementById('signupForm');
    const messageEl = document.getElementById('messageBox');
    const submitBtn = document.getElementById('submitBtn');

    if (!form) {
        console.error('[AuthForms] Signup form not found');
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (submitBtn.disabled) return;

        const full_name = document.getElementById('full_name').value.trim();
        const roll_number = document.getElementById('roll_number').value.trim();
        const email = document.getElementById('signup_email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const password = document.getElementById('signup_password').value;

        // Validation
        if (!full_name || !roll_number || !email || !password) {
            showError(messageEl, 'Please fill in all required fields');
            return;
        }

        if (full_name.length < 2) {
            showError(messageEl, 'Name must be at least 2 characters');
            return;
        }

        if (!isValidEmail(email)) {
            showError(messageEl, 'Please enter a valid email');
            return;
        }

        if (password.length < 6) {
            showError(messageEl, 'Password must be at least 6 characters');
            return;
        }

        // Loading state
        setLoading(submitBtn, true, 'Creating account...');
        hideMessage(messageEl);

        // Attempt signup
        const { success, needsConfirmation, error } = await signup({
            email,
            password,
            full_name,
            roll_number,
            phone
        });

        if (!success) {
            showError(messageEl, parseAuthError(error));
            setLoading(submitBtn, false, 'Sign Up');
            return;
        }

        // Success
        if (needsConfirmation) {
            showSuccess(messageEl, 'Account created! Check your email to verify.');
            setLoading(submitBtn, false, 'Sign Up');
        } else {
            showSuccess(messageEl, 'Account created! Redirecting...');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        }
    });
}

// ============================================================
// UI HELPERS
// ============================================================

function showError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
    el.style.background = 'rgba(211, 47, 47, 0.1)';
    el.style.border = '1px solid rgba(211, 47, 47, 0.3)';
    el.style.color = 'var(--primary)';
}

function showSuccess(el, message) {
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
    el.style.background = 'rgba(76, 175, 80, 0.1)';
    el.style.border = '1px solid rgba(76, 175, 80, 0.3)';
    el.style.color = '#388e3c';
}

function hideMessage(el) {
    if (!el) return;
    el.style.display = 'none';
}

function setLoading(btn, loading, text) {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = text;
}
