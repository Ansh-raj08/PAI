/**
 * SOS Landing Page
 * Uses centralized auth-guard for authentication
 */

import { supabase } from './supabase-config.js';
import { requireAuth } from './auth-guard.js';

console.log('[SOS] Module loaded');

// State
let isProcessing = false;
let currentUser = null;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[SOS] Initializing...');

    // Check authentication - requireAuth returns {user, profile}
    const authResult = await requireAuth();
    if (!authResult) {
        console.log('[SOS] Not authenticated, redirect in progress');
        return;
    }

    // Extract user object
    currentUser = authResult.user;
    console.log('[SOS] User authenticated:', currentUser.email, 'ID:', currentUser.id);
});

// Make triggerSOS available globally for onclick handler
window.triggerSOS = triggerSOS;

function triggerSOS() {
    const button = document.getElementById('sosButton');
    if (!button || isProcessing) return;

    // Check if user is authenticated
    if (!currentUser) {
        showSOSMessage('error', 'Please log in to use SOS feature');
        return;
    }

    // Visual feedback: pressed animation
    button.classList.add('is-pressed');
    window.setTimeout(() => {
        button.classList.remove('is-pressed');
    }, 180);

    // Start SOS process
    isProcessing = true;
    button.disabled = true;

    console.log('[SOS] === SOS TRIGGER INITIATED ===');

    // Update button text
    const sosLabel = button.querySelector('.sos-label');
    if (sosLabel) sosLabel.textContent = 'Getting location...';

    // Check if geolocation is available
    if (!navigator.geolocation) {
        console.error('[SOS] Geolocation not supported');
        showSOSMessage('error', 'Geolocation is not supported by your browser');
        resetSOSButton(button, sosLabel);
        return;
    }

    // Get current position
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            console.log('[SOS] Location captured:', { latitude, longitude, accuracy });

            if (sosLabel) sosLabel.textContent = 'Sending alert...';

            // Send SOS to Supabase
            sendSOSToSupabase(latitude, longitude, button, sosLabel);
        },
        (error) => {
            console.error('[SOS] Geolocation error:', error);

            let errorMessage = 'Unable to get your location';
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'Location permission denied. Please enable location access.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Location information unavailable.';
                    break;
                case error.TIMEOUT:
                    errorMessage = 'Location request timed out.';
                    break;
            }

            showSOSMessage('error', errorMessage);
            resetSOSButton(button, sosLabel);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

async function sendSOSToSupabase(latitude, longitude, button, sosLabel) {
    const locationString = `Lat: ${latitude.toFixed(6)}, Long: ${longitude.toFixed(6)}`;

    console.log('[SOS] === SENDING SOS TO SUPABASE ===');
    console.log('[SOS] Current User:', currentUser);
    console.log('[SOS] User ID:', currentUser?.id);
    console.log('[SOS] Payload:', {
        student_id: currentUser?.id,
        latitude,
        longitude,
        location: locationString
    });

    // Validation
    if (!currentUser || !currentUser.id) {
        console.error('[SOS] ERROR: No user ID available');
        showSOSMessage('error', 'Authentication error. Please login again.');
        resetSOSButton(button, sosLabel);
        return;
    }

    try {
        // Insert emergency alert into Supabase
        const { data, error } = await supabase
            .from('emergency_alerts')
            .insert({
                student_id: currentUser.id,
                location: locationString,
                latitude: latitude,
                longitude: longitude,
                status: 'active'
            })
            .select()
            .single();

        if (error) {
            console.error('[SOS] Supabase INSERT error:', error);
            console.error('[SOS] Error code:', error.code);
            console.error('[SOS] Error message:', error.message);
            console.error('[SOS] Error details:', error.details);
            console.error('[SOS] Error hint:', error.hint);
            throw new Error(error.message);
        }

        console.log('[SOS] Emergency alert created successfully:', data);

        // Success!
        showSOSMessage(
            'success',
            'SOS Alert sent successfully! Campus security has been notified and help is on the way.'
        );
        console.log('[SOS] === SOS SENT SUCCESSFULLY ===');

        resetSOSButton(button, sosLabel);

    } catch (error) {
        console.error('[SOS] Catch block error:', error);

        let errorMsg = 'Failed to send SOS. ';

        if (error.message?.includes('row-level security')) {
            errorMsg += 'Permission error. Please contact support.';
        } else if (error.message?.includes('JWT')) {
            errorMsg += 'Session expired. Please login again.';
        } else {
            errorMsg += error.message || 'Please try again.';
        }

        showSOSMessage('error', errorMsg);
        resetSOSButton(button, sosLabel);
    }
}

function resetSOSButton(button, sosLabel) {
    isProcessing = false;
    if (button) button.disabled = false;
    if (sosLabel) sosLabel.textContent = 'SOS';
}

function showSOSMessage(type, message) {
    let messageEl = document.getElementById('sosMessage');

    if (!messageEl) {
        messageEl = document.createElement('div');
        messageEl.id = 'sosMessage';
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 1rem 1.5rem;
            border-radius: 12px;
            font-weight: 600;
            font-size: 1rem;
            max-width: 90%;
            width: 500px;
            z-index: 1000;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
            animation: slideDown 0.3s ease;
        `;

        if (!document.getElementById('sosMessageStyles')) {
            const style = document.createElement('style');
            style.id = 'sosMessageStyles';
            style.textContent = `
                @keyframes slideDown {
                    from {
                        opacity: 0;
                        transform: translateX(-50%) translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0);
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(messageEl);
    }

    messageEl.textContent = message;

    if (type === 'success') {
        messageEl.style.background = 'linear-gradient(135deg, #4caf50, #388e3c)';
        messageEl.style.color = '#ffffff';
    } else {
        messageEl.style.background = 'linear-gradient(135deg, #f44336, #d32f2f)';
        messageEl.style.color = '#ffffff';
    }

    messageEl.style.display = 'block';

    setTimeout(() => {
        if (messageEl) {
            messageEl.style.display = 'none';
        }
    }, 5000);
}
