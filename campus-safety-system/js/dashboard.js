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
let isSOSProcessing = false;
let sosPanelOpen = false;
let sosClickTimer = null;

const SOS_DOUBLE_CLICK_WINDOW_MS = 220;
const SOS_RETRY_DELAY_MS = 800;
const SOS_CLOSE_ANIMATION_MS = 220;

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

    initSOSControls();

    console.log('[Dashboard] Event listeners initialized');
}

// ============================================================================
// SOS CONTROLS
// ============================================================================

function initSOSControls() {
    const floatingBtn = document.getElementById('floatingSOSBtn');
    const openFromNavBtn = document.getElementById('openSOSFromNavBtn');
    const openFromQuickBtn = document.getElementById('openSOSPanelBtn');
    const closeBtn = document.getElementById('closeSOSPanelBtn');
    const cancelBtn = document.getElementById('cancelSOSBtn');
    const confirmBtn = document.getElementById('confirmSOSBtn');
    const overlay = document.getElementById('sosOverlay');

    if (!floatingBtn || !overlay || !confirmBtn) {
        console.warn('[Dashboard] SOS controls missing from DOM');
        return;
    }

    floatingBtn.addEventListener('click', () => {
        if (isSOSProcessing) return;

        if (sosClickTimer) {
            window.clearTimeout(sosClickTimer);
            sosClickTimer = null;
            triggerInstantSOS();
            return;
        }

        sosClickTimer = window.setTimeout(() => {
            toggleSOSPanel();
            sosClickTimer = null;
        }, SOS_DOUBLE_CLICK_WINDOW_MS);
    });

    if (openFromNavBtn) {
        openFromNavBtn.addEventListener('click', () => {
            if (!isSOSProcessing) openSOSPanel();
        });
    }

    if (openFromQuickBtn) {
        openFromQuickBtn.addEventListener('click', () => {
            if (!isSOSProcessing) openSOSPanel();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeSOSPanel);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeSOSPanel);
    }

    confirmBtn.addEventListener('click', async () => {
        await triggerSOSFlow();
    });

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay && !isSOSProcessing) {
            closeSOSPanel();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && sosPanelOpen && !isSOSProcessing) {
            closeSOSPanel();
        }
    });

    console.log('[Dashboard] SOS controls initialized');
}

function toggleSOSPanel() {
    if (sosPanelOpen) {
        closeSOSPanel();
        return;
    }
    openSOSPanel();
}

function openSOSPanel() {
    const overlay = document.getElementById('sosOverlay');
    const panel = document.getElementById('sosPanel');
    const confirmBtn = document.getElementById('confirmSOSBtn');

    if (!overlay || !panel) return;
    if (sosPanelOpen) return;

    overlay.hidden = false;

    window.requestAnimationFrame(() => {
        overlay.classList.add('is-open');
    });

    setSOSExpanded(true);
    sosPanelOpen = true;

    const statusEl = document.getElementById('sosStatusMessage');
    hideMessage(statusEl);

    if (confirmBtn) {
        window.setTimeout(() => confirmBtn.focus(), 80);
    }
}

function closeSOSPanel() {
    const overlay = document.getElementById('sosOverlay');
    if (!overlay || !sosPanelOpen) return;

    overlay.classList.remove('is-open');
    setSOSExpanded(false);
    sosPanelOpen = false;

    window.setTimeout(() => {
        overlay.hidden = true;
    }, SOS_CLOSE_ANIMATION_MS);
}

function setSOSExpanded(expanded) {
    const floatingBtn = document.getElementById('floatingSOSBtn');
    const navBtn = document.getElementById('openSOSFromNavBtn');

    if (floatingBtn) {
        floatingBtn.setAttribute('aria-expanded', String(expanded));
    }

    if (navBtn) {
        navBtn.setAttribute('aria-expanded', String(expanded));
    }
}

async function triggerInstantSOS() {
    openSOSPanel();
    await triggerSOSFlow();
}

async function triggerSOSFlow() {
    if (isSOSProcessing) return;
    if (!currentUser) {
        showSOSStatus('Please log in to trigger SOS.', 'error');
        return;
    }

    const confirmBtn = document.getElementById('confirmSOSBtn');
    const floatingBtn = document.getElementById('floatingSOSBtn');

    isSOSProcessing = true;

    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Sending SOS...';
    }

    if (floatingBtn) {
        floatingBtn.classList.add('is-sending', 'is-pressed');
        floatingBtn.setAttribute('aria-busy', 'true');
    }

    if (navigator.vibrate) {
        navigator.vibrate(200);
    }

    showSOSStatus('Preparing emergency alert...', 'info');

    try {
        const locationPayload = await resolveSOSLocation();
        if (locationPayload.notice) {
            showSOSStatus(locationPayload.notice, 'info');
        }

        await sendSOSWithRetry(locationPayload);

        showSOSStatus('SOS sent successfully. Campus security has been notified.', 'success');

        if (floatingBtn) {
            floatingBtn.classList.remove('is-sending');
            floatingBtn.classList.add('is-success');
            window.setTimeout(() => floatingBtn.classList.remove('is-success'), 680);
        }

        await fetchComplaints();

        window.setTimeout(() => {
            closeSOSPanel();
        }, 1200);

    } catch (error) {
        console.error('[Dashboard] SOS flow failed:', error);
        showSOSStatus(getSOSErrorMessage(error), 'error');
    } finally {
        isSOSProcessing = false;

        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Trigger SOS Now';
        }

        if (floatingBtn) {
            floatingBtn.classList.remove('is-sending', 'is-pressed');
            floatingBtn.removeAttribute('aria-busy');
        }
    }
}

function resolveSOSLocation() {
    if (!navigator.geolocation) {
        return Promise.resolve({
            latitude: null,
            longitude: null,
            locationText: 'Location unavailable',
            notice: 'Location access is unavailable. Sending SOS without coordinates.'
        });
    }

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const latitude = Number(position.coords.latitude);
                const longitude = Number(position.coords.longitude);
                const locationText = `Lat ${latitude.toFixed(6)}, Lng ${longitude.toFixed(6)}`;

                resolve({ latitude, longitude, locationText, notice: '' });
            },
            (error) => {
                console.warn('[Dashboard] Geolocation fallback:', error);

                let notice = 'Location unavailable. Sending SOS without coordinates.';
                if (error?.code === 1) {
                    notice = 'Location permission denied. Sending SOS without coordinates.';
                }

                resolve({
                    latitude: null,
                    longitude: null,
                    locationText: 'Location unavailable',
                    notice
                });
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 5000
            }
        );
    });
}

async function sendSOSWithRetry(locationPayload) {
    await withRetry(async () => {
        await insertEmergencyAlert(locationPayload);
        await insertEmergencyComplaint(locationPayload);
    }, 1);
}

async function insertEmergencyAlert(locationPayload) {
    const { error } = await supabase
        .from('emergency_alerts')
        .insert({
            student_id: currentUser.id,
            location: locationPayload.locationText,
            latitude: locationPayload.latitude,
            longitude: locationPayload.longitude,
            status: 'active'
        });

    if (error) {
        throw error;
    }
}

async function insertEmergencyComplaint(locationPayload) {
    const complaintPayload = {
        student_id: currentUser.id,
        title: 'Emergency SOS Alert',
        complaint_type: 'safety',
        description: locationPayload.latitude !== null && locationPayload.longitude !== null
            ? `Emergency SOS triggered with coordinates: ${locationPayload.locationText}`
            : 'Emergency SOS triggered without precise coordinates.',
        location: locationPayload.locationText,
        priority: 'emergency'
    };

    let { error } = await supabase
        .from('complaints')
        .insert(complaintPayload);

    // Backward compatibility if priority column is not yet in the complaints table.
    if (error && /column.*priority|priority.*column/i.test(error.message || '')) {
        const { priority, ...fallbackPayload } = complaintPayload;
        ({ error } = await supabase
            .from('complaints')
            .insert(fallbackPayload));
    }

    if (error) {
        throw error;
    }
}

async function withRetry(operation, maxRetries = 1) {
    let attempt = 0;

    while (true) {
        try {
            return await operation();
        } catch (error) {
            const canRetry = attempt < maxRetries && isRetryableNetworkIssue(error);
            if (!canRetry) {
                throw error;
            }

            attempt += 1;
            console.warn(`[Dashboard] SOS retry attempt ${attempt}`);
            await delay(SOS_RETRY_DELAY_MS);
        }
    }
}

function isRetryableNetworkIssue(error) {
    const message = String(error?.message || '').toLowerCase();
    return (
        message.includes('failed to fetch') ||
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('503') ||
        message.includes('504')
    );
}

function getSOSErrorMessage(error) {
    const message = String(error?.message || '').toLowerCase();

    if (message.includes('permission') || message.includes('unauthorized') || message.includes('rls')) {
        return 'Unable to send SOS due to permission settings. Please contact support immediately.';
    }

    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
        return 'Network issue prevented SOS delivery. Please retry now or call campus emergency helpline.';
    }

    return 'Unable to send SOS right now. Please try again immediately or call campus emergency helpline.';
}

function showSOSStatus(text, type) {
    const statusEl = document.getElementById('sosStatusMessage');
    showMessage(statusEl, text, type);
}

function delay(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
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
