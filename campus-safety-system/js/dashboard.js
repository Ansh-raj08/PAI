/**
 * Campus Safety Dashboard (Student)
 * Uses centralized auth-guard for authentication
 */

import { supabase } from './supabase-config.js';
import { requireStudent, logout } from './auth-guard.js';

console.log('[Dashboard] Module loaded');

// Store current user
let currentUser = null;
let userProfile = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Dashboard] Initializing...');

    // SINGLE auth check - requireStudent handles all redirects
    const authResult = await requireStudent();

    // If null, a redirect is happening - stop here
    if (!authResult) {
        console.log('[Dashboard] Auth redirect in progress, stopping init');
        return;
    }

    currentUser = authResult.user;
    userProfile = authResult.profile;

    console.log('[Dashboard] Student authenticated:', currentUser.email);

    // Load user info into UI
    loadUserInfo();

    // Fetch and display complaints
    await fetchComplaints();

    // Setup event listeners
    initEventListeners();

    console.log('[Dashboard] Ready');
});

// ============================================================================
// USER INFO
// ============================================================================

function loadUserInfo() {
    console.log('[Dashboard] Loading user info...');

    const email = currentUser.email || 'N/A';
    const userId = currentUser.id || 'N/A';
    const fullName = userProfile?.full_name || currentUser.user_metadata?.full_name || email.split('@')[0];
    const userType = userProfile?.user_type || 'student';

    // Update UI elements
    const emailEl = document.getElementById('userEmail');
    const idEl = document.getElementById('userId');
    const typeEl = document.getElementById('userType');
    const welcomeEl = document.getElementById('welcomeMessage');

    if (emailEl) emailEl.textContent = email;
    if (idEl) idEl.textContent = userId.substring(0, 8) + '...';
    if (typeEl) typeEl.textContent = userType.toUpperCase();
    if (welcomeEl) welcomeEl.textContent = `Welcome back, ${fullName}!`;

    console.log('[Dashboard] User info loaded:', { email, userType, fullName });
}

// ============================================================================
// FETCH COMPLAINTS
// ============================================================================

async function fetchComplaints() {
    const loadingMsg = document.getElementById('complaintsLoadingMessage');
    const emptyMsg = document.getElementById('complaintsEmptyMessage');
    const listContainer = document.getElementById('complaintsList');

    // Show loading state
    if (loadingMsg) {
        loadingMsg.style.display = 'block';
        loadingMsg.textContent = 'Loading complaints...';
        loadingMsg.style.color = 'var(--text-muted)';
    }
    if (emptyMsg) emptyMsg.style.display = 'none';
    if (listContainer) listContainer.innerHTML = '';

    console.log('[Dashboard] Fetching complaints...');

    try {
        const { data: complaints, error } = await supabase
            .from('complaints')
            .select('*')
            .eq('student_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Dashboard] Fetch error:', error);
            throw new Error(error.message);
        }

        // Hide loading
        if (loadingMsg) loadingMsg.style.display = 'none';

        console.log('[Dashboard] Received complaints:', complaints?.length || 0);

        if (!complaints || complaints.length === 0) {
            if (emptyMsg) emptyMsg.style.display = 'block';
            console.log('[Dashboard] No complaints found');
            return;
        }

        renderComplaints(complaints);
        console.log('[Dashboard] Rendered', complaints.length, 'complaints');

    } catch (error) {
        console.error('[Dashboard] Error fetching complaints:', error);
        if (loadingMsg) {
            loadingMsg.textContent = `Error: ${error.message}. Click refresh to try again.`;
            loadingMsg.style.color = '#d32f2f';
        }
    }
}

// ============================================================================
// RENDER COMPLAINTS
// ============================================================================

function renderComplaints(complaints) {
    const listContainer = document.getElementById('complaintsList');
    if (!listContainer) return;

    const html = complaints.map(complaint => {
        const date = new Date(complaint.created_at);
        const formattedDate = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="complaint-item">
                <h3>${escapeHtml(complaint.title || 'Untitled')}</h3>
                <div class="complaint-meta">
                    <span><strong>Type:</strong> ${escapeHtml(complaint.complaint_type || 'N/A')}</span>
                    <span><strong>Status:</strong> <span class="complaint-status ${complaint.status || 'pending'}">${escapeHtml(complaint.status || 'pending')}</span></span>
                    <span><strong>Submitted:</strong> ${formattedDate}</span>
                    ${complaint.location ? `<span><strong>Location:</strong> ${escapeHtml(complaint.location)}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');

    listContainer.innerHTML = html;
}

// ============================================================================
// SUBMIT COMPLAINT
// ============================================================================

async function submitComplaint(event) {
    event.preventDefault();

    const form = event.target;
    const messageEl = document.getElementById('complaintMessage');
    const submitBtn = document.getElementById('submitComplaintBtn');

    const title = document.getElementById('title').value.trim();
    const type = document.getElementById('complaint_type').value.trim();
    const description = document.getElementById('description').value.trim();
    const location = document.getElementById('location').value.trim();

    // Enhanced validation
    if (!title || !type || !description ||
        title.replace(/\s/g, '') === '' ||
        description.replace(/\s/g, '') === '') {
        showMessage(messageEl, 'Please fill in all required fields with valid content', 'error');
        return;
    }

    if (title.length < 3) {
        showMessage(messageEl, 'Title must be at least 3 characters', 'error');
        return;
    }

    if (description.length < 10) {
        showMessage(messageEl, 'Description must be at least 10 characters', 'error');
        return;
    }

    // Disable button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    hideMessage(messageEl);

    console.log('[Dashboard] Submitting complaint:', { title, type, description, location });

    try {
        const { data, error } = await supabase
            .from('complaints')
            .insert({
                student_id: currentUser.id,
                title: title,
                complaint_type: type,
                description: description,
                location: location || null
            })
            .select()
            .single();

        if (error) {
            console.error('[Dashboard] Submit error:', error);
            throw new Error(error.message);
        }

        console.log('[Dashboard] Complaint submitted:', data);

        // Success
        showMessage(messageEl, 'Complaint submitted successfully!', 'success');
        form.reset();

        // Refresh list and hide form after delay
        setTimeout(async () => {
            await fetchComplaints();
            hideMessage(messageEl);
            const formSection = document.getElementById('complaintFormSection');
            if (formSection) formSection.style.display = 'none';
        }, 2000);

    } catch (error) {
        console.error('[Dashboard] Submit error:', error);
        showMessage(messageEl, error.message || 'Failed to submit complaint. Please try again.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Complaint';
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function initEventListeners() {
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('[Dashboard] Logout clicked');
            await logout();
        });
    }

    // Toggle complaint form
    const toggleBtn = document.getElementById('toggleComplaintFormBtn');
    const closeBtn = document.getElementById('closeComplaintFormBtn');
    const formSection = document.getElementById('complaintFormSection');

    if (toggleBtn && formSection) {
        toggleBtn.addEventListener('click', () => {
            formSection.style.display = 'block';
            formSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }

    if (closeBtn && formSection) {
        closeBtn.addEventListener('click', () => {
            formSection.style.display = 'none';
            const form = document.getElementById('complaintForm');
            if (form) form.reset();
            hideMessage(document.getElementById('complaintMessage'));
        });
    }

    // Submit form
    const form = document.getElementById('complaintForm');
    if (form) {
        form.addEventListener('submit', submitComplaint);
    }

    // Refresh button
    const refreshBtn = document.getElementById('refreshComplaintsBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            console.log('[Dashboard] Manual refresh triggered');

            refreshBtn.disabled = true;
            const originalText = refreshBtn.textContent;
            refreshBtn.textContent = 'Refreshing...';

            await fetchComplaints();

            refreshBtn.disabled = false;
            refreshBtn.textContent = originalText;
        });
    }

    console.log('[Dashboard] Event listeners initialized');
}

// ============================================================================
// UTILITIES
// ============================================================================

function showMessage(element, text, type) {
    if (!element) return;
    element.textContent = text;
    element.style.display = 'block';
    element.className = `message-box ${type}`;
}

function hideMessage(element) {
    if (!element) return;
    element.style.display = 'none';
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
