/**
 * Admin Dashboard - Campus Safety System
 * Uses centralized auth-guard for authentication
 */

import { supabase } from './supabase-config.js';
import { requireAdmin, logout } from './auth-guard.js';

console.log('[Admin] Module loaded');

// State
let currentAdmin = null;
let adminProfile = null;
let allComplaints = [];
let allAlerts = [];
let sosSubscription = null;
let deleteTargetId = null;
let mapInstances = {}; // Track initialized maps by alert ID
let timerIntervals = {}; // Track active timers by alert ID

// =======================
// INITIALIZATION
// =======================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Admin] Initializing...');

    // SINGLE auth check - requireAdmin handles all redirects
    const authResult = await requireAdmin();

    // If null, a redirect is happening - stop here
    if (!authResult) {
        console.log('[Admin] Auth redirect in progress, stopping init');
        return;
    }

    currentAdmin = authResult.user;
    adminProfile = authResult.profile;

    console.log('[Admin] Admin authenticated:', currentAdmin.email);

    // Load admin info
    loadAdminInfo();

    // Initialize tabs
    initTabs();

    // Fetch initial data
    await Promise.all([
        fetchComplaints(),
        fetchSOSAlerts()
    ]);

    // Update stats
    updateStats();

    // Setup event listeners
    initEventListeners();

    // Setup real-time subscription for SOS alerts
    setupRealtimeSubscription();

    console.log('[Admin] Ready');
});

// =======================
// ADMIN INFO
// =======================
function loadAdminInfo() {
    const welcomeEl = document.getElementById('welcomeMessage');
    const fullName = adminProfile?.full_name || currentAdmin.email.split('@')[0];

    if (welcomeEl) {
        welcomeEl.textContent = `Welcome, ${fullName}!`;
    }
}

// =======================
// TABS
// =======================
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Update active tab button
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show corresponding content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });

            if (tabId === 'complaints') {
                document.getElementById('complaintsTab').classList.add('active');
            } else if (tabId === 'sos-alerts') {
                document.getElementById('sosAlertsTab').classList.add('active');
            }
        });
    });
}

// =======================
// FETCH COMPLAINTS
// =======================
async function fetchComplaints() {
    const loadingEl = document.getElementById('complaintsLoading');
    const emptyEl = document.getElementById('complaintsEmpty');
    const listEl = document.getElementById('complaintsList');

    if (loadingEl) loadingEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    if (listEl) listEl.innerHTML = '';

    console.log('[Admin] Fetching complaints...');
    console.log('[Admin] Admin user:', currentAdmin?.email, 'Type:', adminProfile?.user_type);

    try {
        const { data, error } = await supabase
            .from('complaints')
            .select(`
                *,
                profiles!complaints_student_id_fkey (
                    full_name,
                    email,
                    roll_number
                )
            `)
            .order('created_at', { ascending: false });

        console.log('[Admin] Complaints query response:', {
            error,
            dataCount: data?.length,
            status: error ? 'FAILED' : 'SUCCESS'
        });

        // Debug: Log first complaint structure
        if (data && data.length > 0) {
            console.log('[Admin] Sample complaint:', {
                id: data[0].id,
                title: data[0].title,
                student_id: data[0].student_id,
                profiles: data[0].profiles
            });
            console.log('[Admin] Profile email:', data[0]?.profiles?.email || 'MISSING');
        }

        if (error) {
            console.error('[Admin] Fetch complaints error:', error);
            console.error('[Admin] Error code:', error.code);
            console.error('[Admin] Error message:', error.message);
            throw error;
        }

        allComplaints = data || [];
        console.log('[Admin] Fetched complaints:', allComplaints.length);

        if (loadingEl) loadingEl.style.display = 'none';

        renderComplaints();

    } catch (err) {
        console.error('[Admin] Error:', err);
        if (loadingEl) {
            loadingEl.textContent = 'Error loading complaints. Please refresh.';
            loadingEl.style.color = '#d32f2f';
        }
    }
}

// =======================
// RENDER COMPLAINTS
// =======================
function renderComplaints() {
    const emptyEl = document.getElementById('complaintsEmpty');
    const listEl = document.getElementById('complaintsList');
    const filterValue = document.getElementById('statusFilter')?.value || 'all';

    // Filter complaints
    let filtered = allComplaints;
    if (filterValue !== 'all') {
        filtered = allComplaints.filter(c => c.status === filterValue);
    }

    if (filtered.length === 0) {
        if (emptyEl) emptyEl.style.display = 'block';
        if (listEl) listEl.innerHTML = '';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    const html = filtered.map(complaint => {
        const student = complaint.profiles || {};
        const date = new Date(complaint.created_at);
        const formattedDate = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="complaint-card" data-id="${complaint.id}">
                <div class="complaint-card-header">
                    <div>
                        <h4>${escapeHtml(complaint.title || 'Untitled')}</h4>
                        <span class="complaint-status ${complaint.status || 'pending'}">${escapeHtml(complaint.status || 'pending')}</span>
                    </div>
                </div>
                <div class="complaint-card-body">
                    <p><strong>Type:</strong> ${escapeHtml(complaint.complaint_type || 'N/A')}</p>
                    <p><strong>Student:</strong> ${escapeHtml(student.full_name || 'Unknown')} (${escapeHtml(student.roll_number || 'N/A')})</p>
                    <p><strong>Email:</strong> ${escapeHtml(student.email || 'N/A')}</p>
                    <p><strong>Submitted:</strong> ${formattedDate}</p>
                    ${complaint.location ? `<p><strong>Location:</strong> ${escapeHtml(complaint.location)}</p>` : ''}
                </div>
                <div class="complaint-card-footer">
                    <button class="btn btn-info btn-sm" onclick="viewComplaint('${complaint.id}')">
                        View Details
                    </button>
                    <select class="status-select" onchange="updateStatus('${complaint.id}', this.value)" ${complaint.status === 'resolved' ? 'disabled' : ''}>
                        <option value="pending" ${complaint.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="in_progress" ${complaint.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                        <option value="resolved" ${complaint.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                        <option value="rejected" ${complaint.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                    </select>
                    <button class="btn btn-danger btn-sm" onclick="confirmDelete('${complaint.id}')">
                        Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');

    if (listEl) listEl.innerHTML = html;
}

// =======================
// VIEW COMPLAINT DETAILS
// =======================
window.viewComplaint = function(id) {
    const complaint = allComplaints.find(c => c.id == id);
    if (!complaint) return;

    const student = complaint.profiles || {};
    const date = new Date(complaint.created_at);
    const formattedDate = date.toLocaleString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');

    if (modalTitle) modalTitle.textContent = complaint.title || 'Complaint Details';

    if (modalContent) {
        modalContent.innerHTML = `
            <div style="display: grid; gap: 0.75rem;">
                <p><strong>Status:</strong> <span class="complaint-status ${complaint.status}">${escapeHtml(complaint.status)}</span></p>
                <p><strong>Type:</strong> ${escapeHtml(complaint.complaint_type)}</p>
                <p><strong>Description:</strong></p>
                <div style="background: #f5f5f5; padding: 1rem; border-radius: 8px; white-space: pre-wrap;">${escapeHtml(complaint.description)}</div>
                ${complaint.location ? `<p><strong>Location:</strong> ${escapeHtml(complaint.location)}</p>` : ''}
                <hr style="border: none; border-top: 1px solid var(--line); margin: 0.5rem 0;">
                <p><strong>Student Name:</strong> ${escapeHtml(student.full_name || 'Unknown')}</p>
                <p><strong>Roll Number:</strong> ${escapeHtml(student.roll_number || 'N/A')}</p>
                <p><strong>Email:</strong> ${escapeHtml(student.email || 'N/A')}</p>
                <p><strong>Submitted:</strong> ${formattedDate}</p>
            </div>
        `;
    }

    document.getElementById('complaintModal').classList.add('active');
};

window.closeModal = function() {
    document.getElementById('complaintModal').classList.remove('active');
};

// =======================
// UPDATE COMPLAINT STATUS
// =======================
window.updateStatus = async function(id, newStatus) {
    console.log('[Admin] Updating status:', id, newStatus);

    try {
        const { error } = await supabase
            .from('complaints')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) throw error;

        // Update local state
        const complaint = allComplaints.find(c => c.id == id);
        if (complaint) complaint.status = newStatus;

        console.log('[Admin] Status updated successfully');

        // Update stats
        updateStats();

        // Show success feedback
        showToast('Status updated successfully', 'success');

    } catch (err) {
        console.error('[Admin] Update status error:', err);
        showToast('Failed to update status', 'error');
        // Refresh to reset UI
        await fetchComplaints();
    }
};

// =======================
// DELETE COMPLAINT
// =======================
window.confirmDelete = function(id) {
    deleteTargetId = id;
    document.getElementById('deleteModal').classList.add('active');
};

window.closeDeleteModal = function() {
    deleteTargetId = null;
    document.getElementById('deleteModal').classList.remove('active');
};

async function deleteComplaint() {
    if (!deleteTargetId) return;

    const btn = document.getElementById('confirmDeleteBtn');
    btn.disabled = true;
    btn.textContent = 'Deleting...';

    console.log('[Admin] Deleting complaint:', deleteTargetId);

    try {
        const { error } = await supabase
            .from('complaints')
            .delete()
            .eq('id', deleteTargetId);

        if (error) throw error;

        // Remove from local state
        allComplaints = allComplaints.filter(c => c.id != deleteTargetId);

        console.log('[Admin] Complaint deleted successfully');

        closeDeleteModal();
        renderComplaints();
        updateStats();
        showToast('Complaint deleted successfully', 'success');

    } catch (err) {
        console.error('[Admin] Delete error:', err);
        showToast('Failed to delete complaint', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Delete';
    }
}

// =======================
// FETCH SOS ALERTS
// =======================
async function fetchSOSAlerts() {
    const loadingEl = document.getElementById('alertsLoading');
    const emptyEl = document.getElementById('alertsEmpty');
    const listEl = document.getElementById('alertsList');

    if (loadingEl) loadingEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    if (listEl) listEl.innerHTML = '';

    console.log('[Admin] Fetching SOS alerts...');
    console.log('[Admin] Admin user:', currentAdmin?.email);

    try {
        const { data, error } = await supabase
            .from('emergency_alerts')
            .select(`
                *,
                profiles!emergency_alerts_student_id_fkey (
                    full_name,
                    email,
                    roll_number
                )
            `)
            .order('created_at', { ascending: false });

        console.log('[Admin] Alerts query response:', {
            error,
            dataCount: data?.length,
            status: error ? 'FAILED' : 'SUCCESS'
        });

        // Debug: Log first alert structure
        if (data && data.length > 0) {
            console.log('[Admin] Sample alert:', {
                id: data[0].id,
                student_id: data[0].student_id,
                location: data[0].location,
                latitude: data[0].latitude,
                longitude: data[0].longitude,
                profiles: data[0].profiles
            });
            console.log('[Admin] Alert profile email:', data[0]?.profiles?.email || 'MISSING');
        }

        if (error) {
            console.error('[Admin] Fetch alerts error:', error);
            console.error('[Admin] Error code:', error.code);
            console.error('[Admin] Error message:', error.message);
            throw error;
        }

        allAlerts = data || [];
        console.log('[Admin] Fetched alerts:', allAlerts.length);

        if (loadingEl) loadingEl.style.display = 'none';

        // Cleanup old maps before re-rendering
        cleanupMaps();

        renderSOSAlerts();
        updateSOSCount();

    } catch (err) {
        console.error('[Admin] Error:', err);
        if (loadingEl) {
            loadingEl.textContent = 'Error loading alerts. Please refresh.';
            loadingEl.style.color = '#d32f2f';
        }
    }
}

// =======================
// RENDER SOS ALERTS
// =======================
function renderSOSAlerts() {
    const emptyEl = document.getElementById('alertsEmpty');
    const listEl = document.getElementById('alertsList');

    if (allAlerts.length === 0) {
        if (emptyEl) emptyEl.style.display = 'block';
        if (listEl) listEl.innerHTML = '';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    const html = allAlerts.map((alert, index) => {
        const student = alert.profiles || {};
        const date = new Date(alert.created_at);
        const formattedDate = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const isResolved = alert.status === 'resolved';
        const hasCoordinates = alert.latitude && alert.longitude &&
                               isValidCoordinate(alert.latitude, alert.longitude);
        const mapsUrl = hasCoordinates
            ? `https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`
            : null;

        // Unique map container ID
        const mapId = `map-${alert.id}`;

        return `
            <div class="sos-alert ${isResolved ? 'resolved' : ''}" data-id="${alert.id}">
                <h4>
                    <span class="pulse"></span>
                    ${isResolved ? 'RESOLVED' : 'ACTIVE'} SOS Alert
                </h4>
                <div style="display: grid; gap: 0.5rem; font-size: 0.9rem;">
                    <p><strong>Student:</strong> ${escapeHtml(student.full_name || 'Unknown')} (${escapeHtml(student.roll_number || 'N/A')})</p>
                    <p><strong>Email:</strong> ${escapeHtml(student.email || 'N/A')}</p>
                    <p><strong>Time:</strong> ${formattedDate}</p>
                    <p><strong>Location:</strong> ${escapeHtml(alert.location || 'Unknown')}</p>
                    ${mapsUrl ? `<p><a href="${mapsUrl}" target="_blank" class="location-link">View on Google Maps</a></p>` : ''}
                </div>

                <!-- Map Toggle Button -->
                <div style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${hasCoordinates ? `
                        <button
                            class="btn-map"
                            id="mapBtn-${alert.id}"
                            onclick="toggleMap('${alert.id}', ${alert.latitude}, ${alert.longitude}, '${alert.created_at}')"
                            data-map-loaded="false">
                            <span>📍</span>
                            <span>View Location</span>
                        </button>
                    ` : `
                        <div class="map-error">
                            📍 Location coordinates not available
                        </div>
                    `}

                    ${!isResolved ? `
                        <button class="btn btn-success btn-sm" onclick="resolveAlert('${alert.id}')">
                            Mark as Resolved
                        </button>
                    ` : ''}
                </div>

                <!-- Map Container (hidden by default) -->
                ${hasCoordinates ? `
                    <div id="${mapId}" class="map-container" data-alert-id="${alert.id}">
                        <div id="timer-${alert.id}" style="
                            position: absolute;
                            top: 10px;
                            right: 10px;
                            background: rgba(255, 255, 255, 0.95);
                            padding: 0.5rem 0.75rem;
                            border-radius: 6px;
                            font-weight: 600;
                            font-size: 0.85rem;
                            color: #d32f2f;
                            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                            z-index: 1000;
                            border: 2px solid #d32f2f;
                        "></div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    if (listEl) listEl.innerHTML = html;
}

// =======================
// MAP FUNCTIONALITY & TIMERS
// =======================

/**
 * Validate if coordinates are within valid ranges
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {boolean}
 */
function isValidCoordinate(lat, lng) {
    return (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        !isNaN(lat) &&
        !isNaN(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
    );
}

/**
 * Format elapsed time from a timestamp
 * @param {string} createdAt - ISO timestamp
 * @returns {string} Formatted time like "10 sec ago", "3 min 12 sec", "1 hr 5 min"
 */
function formatElapsedTime(createdAt) {
    if (!createdAt) return 'Time unknown';

    const created = new Date(createdAt);
    if (isNaN(created.getTime())) return 'Invalid time';

    const now = new Date();
    const elapsedMs = now - created;

    // Handle future timestamps (clock skew)
    if (elapsedMs < 0) return 'Just now';

    const elapsedSeconds = Math.floor(elapsedMs / 1000);

    // Less than 1 minute: "X sec ago"
    if (elapsedSeconds < 60) {
        return `${elapsedSeconds} sec ago`;
    }

    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    const remainingSeconds = elapsedSeconds % 60;

    // Less than 1 hour: "X min Y sec"
    if (elapsedMinutes < 60) {
        return `${elapsedMinutes} min ${remainingSeconds} sec`;
    }

    const elapsedHours = Math.floor(elapsedMinutes / 60);
    const remainingMinutes = elapsedMinutes % 60;

    // 1 hour or more: "X hr Y min"
    return `${elapsedHours} hr ${remainingMinutes} min`;
}

/**
 * Start timer for a specific alert
 * Timer updates every second until explicitly stopped
 * @param {string} alertId - Alert ID
 * @param {string} createdAt - ISO timestamp
 */
function startTimer(alertId, createdAt) {
    // Stop existing timer if any (prevents duplicates)
    stopTimer(alertId);

    console.log('[Timer] Starting timer for alert:', alertId);

    const timerEl = document.getElementById(`timer-${alertId}`);
    if (!timerEl) {
        console.warn('[Timer] Timer element not found for alert:', alertId);
        return;
    }

    // Update immediately
    timerEl.textContent = formatElapsedTime(createdAt);

    // Update every second - simple and clean
    const intervalId = setInterval(() => {
        const el = document.getElementById(`timer-${alertId}`);
        if (el) {
            el.textContent = formatElapsedTime(createdAt);
        }
    }, 1000);

    timerIntervals[alertId] = intervalId;
    console.log('[Timer] Timer started for alert:', alertId);
}

/**
 * Stop timer for a specific alert
 * @param {string} alertId - Alert ID
 */
function stopTimer(alertId) {
    const intervalId = timerIntervals[alertId];
    if (intervalId) {
        clearInterval(intervalId);
        delete timerIntervals[alertId];
        console.log('[Timer] Timer stopped for alert:', alertId);
    }
}

/**
 * Cleanup all active timers
 */
function cleanupTimers() {
    console.log('[Timer] Cleaning up', Object.keys(timerIntervals).length, 'active timers');

    Object.keys(timerIntervals).forEach(alertId => {
        stopTimer(alertId);
    });

    timerIntervals = {};
}

/**
 * Toggle map visibility for a specific SOS alert
 * Lazy-loads map on first click
 * Starts/stops timer based on visibility
 * @param {string} alertId - Alert ID
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} createdAt - ISO timestamp for timer
 */
window.toggleMap = function(alertId, lat, lng, createdAt) {
    console.log('[Map] Toggle map for alert:', alertId, { lat, lng });

    const mapContainer = document.getElementById(`map-${alertId}`);
    const button = document.getElementById(`mapBtn-${alertId}`);

    if (!mapContainer || !button) {
        console.error('[Map] Container or button not found for alert:', alertId);
        return;
    }

    // Validate coordinates
    if (!isValidCoordinate(lat, lng)) {
        console.error('[Map] Invalid coordinates:', { lat, lng });
        showMapError(mapContainer, 'Invalid location coordinates');
        return;
    }

    const isMapLoaded = button.dataset.mapLoaded === 'true';
    const isMapVisible = mapContainer.classList.contains('active');

    // Case 1: Map not loaded yet → initialize and show
    if (!isMapLoaded) {
        console.log('[Map] First load, initializing map...');
        button.disabled = true;
        button.innerHTML = '<span>⏳</span><span>Loading map...</span>';

        // Small delay to allow UI to update
        setTimeout(() => {
            const success = initMap(alertId, lat, lng);

            if (success) {
                mapContainer.classList.add('active');
                button.dataset.mapLoaded = 'true';
                button.innerHTML = '<span>📍</span><span>Hide Map</span>';

                // START TIMER when map is shown for first time
                startTimer(alertId, createdAt);
            } else {
                button.innerHTML = '<span>📍</span><span>View Location</span>';
            }

            button.disabled = false;
        }, 100);

        return;
    }

    // Case 2: Map already loaded → just toggle visibility
    if (isMapVisible) {
        console.log('[Map] Hiding map...');
        mapContainer.classList.remove('active');
        button.innerHTML = '<span>📍</span><span>View Location</span>';

        // STOP TIMER when map is hidden
        stopTimer(alertId);
    } else {
        console.log('[Map] Showing map...');
        mapContainer.classList.add('active');
        button.innerHTML = '<span>📍</span><span>Hide Map</span>';

        // Invalidate size to fix rendering issues when showing again
        const mapInstance = mapInstances[alertId];
        if (mapInstance) {
            setTimeout(() => {
                mapInstance.invalidateSize();
            }, 100);
        }

        // RESTART TIMER when map is shown again (resumes from created_at)
        startTimer(alertId, createdAt);
    }
};

/**
 * Initialize Leaflet map for a specific alert
 * @param {string} alertId - Alert ID
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {boolean} Success status
 */
function initMap(alertId, lat, lng) {
    const containerId = `map-${alertId}`;
    const container = document.getElementById(containerId);

    if (!container) {
        console.error('[Map] Container not found:', containerId);
        return false;
    }

    // Prevent duplicate initialization
    if (mapInstances[alertId]) {
        console.warn('[Map] Map already initialized for alert:', alertId);
        return true;
    }

    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
        console.error('[Map] Leaflet library not loaded');
        showMapError(container, 'Map library not loaded. Please refresh the page.');
        return false;
    }

    try {
        console.log('[Map] Initializing Leaflet map:', { alertId, lat, lng, containerId });

        // Ensure container is visible BEFORE initializing
        // (Leaflet needs visible container for proper initialization)
        const wasHidden = !container.classList.contains('active');
        if (wasHidden) {
            container.classList.add('active');
        }

        // Small delay to ensure DOM has painted
        setTimeout(() => {
            try {
                // Create map centered on coordinates
                const map = L.map(containerId, {
                    center: [lat, lng],
                    zoom: 16, // High zoom for exact location
                    scrollWheelZoom: false, // Prevent accidental scroll zoom
                    dragging: true,
                    touchZoom: true,
                    doubleClickZoom: true,
                    boxZoom: false,
                    keyboard: false,
                    zoomControl: true
                });

                // Add OpenStreetMap tile layer (no API key required)
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap',
                    maxZoom: 19,
                    minZoom: 10
                }).addTo(map);

                // Add custom marker with red color for emergency
                const customIcon = L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                });

                const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);

                // Add popup
                marker.bindPopup(`
                    <div style="text-align: center; font-family: inherit;">
                        <strong style="color: #d32f2f;">🚨 SOS Location</strong><br>
                        <span style="font-size: 0.85rem; color: #666;">
                            ${lat.toFixed(6)}, ${lng.toFixed(6)}
                        </span>
                    </div>
                `).openPopup();

                // CRITICAL: Force map to recalculate size
                // This fixes blank map issues
                setTimeout(() => {
                    map.invalidateSize();
                    console.log('[Map] invalidateSize() called for alert:', alertId);
                }, 100);

                // Store map instance
                mapInstances[alertId] = map;

                console.log('[Map] Successfully initialized map for alert:', alertId);

            } catch (initError) {
                console.error('[Map] Map creation error:', initError);
                showMapError(container, 'Failed to initialize map: ' + initError.message);
            }
        }, 50);

        return true;

    } catch (error) {
        console.error('[Map] Initialization error:', error);
        showMapError(container, 'Failed to load map. Please try again.');
        return false;
    }
}

/**
 * Show error message in map container
 * @param {HTMLElement} container - Map container element
 * @param {string} message - Error message
 */
function showMapError(container, message) {
    if (!container) return;

    container.innerHTML = `
        <div class="map-error">
            ⚠️ ${escapeHtml(message)}
        </div>
    `;
    container.classList.add('active');
}

/**
 * Cleanup all map instances (called when re-rendering alerts)
 */
function cleanupMaps() {
    console.log('[Map] Cleaning up', Object.keys(mapInstances).length, 'map instances');

    Object.keys(mapInstances).forEach(alertId => {
        const mapInstance = mapInstances[alertId];
        if (mapInstance) {
            try {
                mapInstance.remove();
            } catch (e) {
                console.warn('[Map] Error removing map:', alertId, e);
            }
        }
    });

    mapInstances = {};

    // Also cleanup all timers
    cleanupTimers();
}

// =======================
// RESOLVE SOS ALERT
// =======================
window.resolveAlert = async function(id) {
    console.log('[Admin] Resolving alert:', id);

    try {
        // STEP 1: Update database
        const { error } = await supabase
            .from('emergency_alerts')
            .update({ status: 'resolved' })
            .eq('id', id);

        if (error) throw error;

        // STEP 2: Update local state
        const alert = allAlerts.find(a => a.id == id);
        if (alert) alert.status = 'resolved';

        console.log('[Admin] Alert resolved successfully');

        // STEP 3: Stop timer for this specific alert
        stopTimer(id);

        // STEP 4: Cleanup maps and re-render
        cleanupMaps();
        renderSOSAlerts();
        updateStats();
        updateSOSCount();
        showToast('SOS Alert marked as resolved', 'success');

    } catch (err) {
        console.error('[Admin] Resolve error:', err);
        showToast('Failed to resolve alert', 'error');
    }
};

// =======================
// REAL-TIME SUBSCRIPTION
// =======================
function setupRealtimeSubscription() {
    console.log('[Admin] Setting up real-time subscription...');

    sosSubscription = supabase
        .channel('emergency_alerts_changes')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'emergency_alerts'
            },
            async (payload) => {
                console.log('[Admin] New SOS alert received:', payload.new);

                // Fetch the full alert with profile info
                const { data, error } = await supabase
                    .from('emergency_alerts')
                    .select(`
                        *,
                        profiles (
                            full_name,
                            email,
                            roll_number
                        )
                    `)
                    .eq('id', payload.new.id)
                    .single();

                if (!error && data) {
                    // Add to beginning of alerts array
                    allAlerts.unshift(data);
                    renderSOSAlerts();
                    updateStats();
                    updateSOSCount();

                    // Show notification
                    showNewAlertNotification(data);
                }
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'emergency_alerts'
            },
            async (payload) => {
                console.log('[Admin] SOS alert updated:', payload.new);

                const alertId = payload.new.id;
                const newStatus = payload.new.status;

                // Update local state
                const alert = allAlerts.find(a => a.id === alertId);
                if (alert) {
                    alert.status = newStatus;

                    // Stop timer if resolved
                    if (newStatus === 'resolved') {
                        console.log('[Admin] Real-time: Alert resolved, stopping timer:', alertId);
                        stopTimer(alertId);
                    }

                    // Cleanup and re-render
                    cleanupMaps();
                    renderSOSAlerts();
                    updateStats();
                    updateSOSCount();
                }
            }
        )
        .subscribe((status) => {
            console.log('[Admin] Subscription status:', status);
        });
}

function showNewAlertNotification(alert) {
    const student = alert.profiles || {};

    // Create notification badge
    const badge = document.createElement('div');
    badge.className = 'new-alert-badge';
    badge.innerHTML = `🚨 New SOS Alert from ${escapeHtml(student.full_name || 'Unknown')}`;
    badge.onclick = () => {
        // Switch to SOS tab
        document.querySelector('[data-tab="sos-alerts"]').click();
        badge.remove();
    };

    document.body.appendChild(badge);

    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (badge.parentNode) badge.remove();
    }, 10000);

    // Play alert sound if available
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleRI9n+LfqGQaMJze5KRiGDGU2OSpaR4vlNLip28nM5XQ4at0LzaV0eKseDE7l9Hiq3gyO5fR4qx4MTuX0eKseDI7l9Hirmh4PJTQ4615MjqX0eOreDI5l9DjrHgxOJfQ46x4MTiX0OOseDI4l9DjrHgyOJfQ46x4MjiX0OOteDE4l9DjrXgxOJfQ4614MTmX0OOtdzA5l9DjrXcwOZfQ4614MDmX0OOueDA5l9Hjrngw');
        audio.volume = 0.3;
        audio.play().catch(() => {}); // Ignore autoplay errors
    } catch (e) {}
}

// =======================
// UPDATE STATS
// =======================
function updateStats() {
    const totalEl = document.getElementById('totalComplaints');
    const pendingEl = document.getElementById('pendingComplaints');
    const activeEl = document.getElementById('activeAlerts');
    const resolvedEl = document.getElementById('resolvedToday');

    const total = allComplaints.length;
    const pending = allComplaints.filter(c => c.status === 'pending').length;
    const activeAlerts = allAlerts.filter(a => a.status !== 'resolved').length;

    // Resolved today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const resolvedToday = allComplaints.filter(c => {
        if (c.status !== 'resolved') return false;
        const updated = new Date(c.updated_at || c.created_at);
        return updated >= today;
    }).length;

    if (totalEl) totalEl.textContent = total;
    if (pendingEl) pendingEl.textContent = pending;
    if (activeEl) activeEl.textContent = activeAlerts;
    if (resolvedEl) resolvedEl.textContent = resolvedToday;
}

function updateSOSCount() {
    const countEl = document.getElementById('sosAlertCount');
    const activeCount = allAlerts.filter(a => a.status !== 'resolved').length;

    if (countEl) {
        countEl.textContent = activeCount > 0 ? `(${activeCount})` : '';
    }
}

// =======================
// EVENT LISTENERS
// =======================
function initEventListeners() {
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await logout();
        });
    }

    // Refresh complaints
    const refreshComplaintsBtn = document.getElementById('refreshComplaintsBtn');
    if (refreshComplaintsBtn) {
        refreshComplaintsBtn.addEventListener('click', async () => {
            refreshComplaintsBtn.disabled = true;
            refreshComplaintsBtn.textContent = 'Refreshing...';
            await fetchComplaints();
            updateStats();
            refreshComplaintsBtn.disabled = false;
            refreshComplaintsBtn.textContent = 'Refresh';
        });
    }

    // Refresh alerts
    const refreshAlertsBtn = document.getElementById('refreshAlertsBtn');
    if (refreshAlertsBtn) {
        refreshAlertsBtn.addEventListener('click', async () => {
            refreshAlertsBtn.disabled = true;
            refreshAlertsBtn.textContent = 'Refreshing...';
            await fetchSOSAlerts();
            updateStats();
            refreshAlertsBtn.disabled = false;
            refreshAlertsBtn.textContent = 'Refresh';
        });
    }

    // Status filter
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            renderComplaints();
        });
    }

    // Delete confirmation
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', deleteComplaint);
    }

    // Close modals on outside click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });

    // ESC key to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        }
    });
}

// =======================
// UTILITIES
// =======================
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
    // Remove existing toast
    const existing = document.querySelector('.toast-message');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        font-weight: 500;
        color: white;
        z-index: 1001;
        animation: slideIn 0.3s ease;
        ${type === 'success' ? 'background: #4caf50;' : ''}
        ${type === 'error' ? 'background: #f44336;' : ''}
        ${type === 'info' ? 'background: #2196f3;' : ''}
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (sosSubscription) {
        supabase.removeChannel(sosSubscription);
    }
    // Cleanup all maps and timers
    cleanupMaps();
    cleanupTimers();
});
