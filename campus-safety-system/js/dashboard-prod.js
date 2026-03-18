/**
 * Campus Safety Dashboard - Production Version
 * Handles user authentication, complaint management, and UI interactions
 * @version 2.0.0
 * @author Campus Safety Team
 */

console.log("[Dashboard] Module loaded v2.0.0");

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  API_BASE_URL: window.location.hostname === 'localhost'
    ? 'http://localhost:8000'
    : '/api', // Production will use relative paths
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // milliseconds
  CACHE_TTL: 30000, // 30 seconds
  AUTO_REFRESH_INTERVAL: 60000, // 1 minute
  DEBOUNCE_DELAY: 300, // milliseconds
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const AppState = {
  user: {
    user_id: null,
    user_type: null,
    user_email: null,
  },
  complaints: [],
  isLoading: false,
  isSubmitting: false,
  lastFetch: null,
  abortController: null,
  refreshInterval: null,
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[Dashboard] Initializing...");

  try {
    // 1. Check authentication
    if (!checkAuthentication()) return;

    // 2. Load user data
    loadUserInfo();

    // 3. Validate session with backend
    const sessionValid = await validateSession();
    if (!sessionValid) {
      console.warn("[Dashboard] Session invalid. Redirecting to login...");
      handleSessionExpired();
      return;
    }

    // 4. Load complaints
    await loadComplaints();

    // 5. Initialize event listeners
    initEventListeners();

    // 6. Start auto-refresh
    startAutoRefresh();

    // 7. Check online status
    monitorOnlineStatus();

    console.log("[Dashboard] Initialization complete");
  } catch (error) {
    console.error("[Dashboard] Initialization failed:", error);
    showGlobalError("Failed to initialize dashboard. Please refresh the page.");
  }
});

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Check if user is authenticated via localStorage
 * @returns {boolean} Authentication status
 */
function checkAuthentication() {
  const userId = localStorage.getItem("user_id");
  const userEmail = localStorage.getItem("user_email");

  if (!userId || !userEmail) {
    console.warn("[Auth] No credentials found. Redirecting to login...");
    window.location.href = "login.html";
    return false;
  }

  console.log("[Auth] User authenticated:", { userId, userEmail });
  return true;
}

/**
 * Validate session with backend
 * Pings get_complaints to verify session is still valid
 * @returns {Promise<boolean>} Session validity
 */
async function validateSession() {
  try {
    console.log("[Auth] Validating session with backend...");

    const response = await fetch(`${CONFIG.API_BASE_URL}/api/get_complaints.php`, {
      method: "GET",
      credentials: "include",
    });

    if (response.status === 401 || response.status === 403) {
      console.error("[Auth] Session expired or forbidden");
      return false;
    }

    const data = await response.json();

    if (!data.success && data.message?.includes("login")) {
      console.error("[Auth] Backend requires login");
      return false;
    }

    console.log("[Auth] Session valid");
    return true;
  } catch (error) {
    console.error("[Auth] Session validation failed:", error);
    // Don't fail hard on network error
    return true; // Assume valid, will fail on next operation
  }
}

/**
 * Handle expired session
 */
function handleSessionExpired() {
  localStorage.clear();
  showGlobalError("Your session has expired. Redirecting to login...");
  setTimeout(() => {
    window.location.href = "login.html";
  }, 2000);
}

/**
 * Load user info from localStorage and update UI
 */
function loadUserInfo() {
  AppState.user.user_id = localStorage.getItem("user_id");
  AppState.user.user_type = localStorage.getItem("user_type") || "student";
  AppState.user.user_email = localStorage.getItem("user_email");

  console.log("[User] Loaded user info:", AppState.user);

  // Update UI elements
  const userEmailEl = document.getElementById("userEmail");
  const userIdEl = document.getElementById("userId");
  const userTypeEl = document.getElementById("userType");
  const welcomeMessageEl = document.getElementById("welcomeMessage");

  if (userEmailEl) userEmailEl.textContent = AppState.user.user_email || "N/A";
  if (userIdEl) userIdEl.textContent = AppState.user.user_id || "N/A";
  if (userTypeEl) userTypeEl.textContent = AppState.user.user_type.toUpperCase();
  if (welcomeMessageEl) {
    const firstName = AppState.user.user_email?.split("@")[0] || "Student";
    welcomeMessageEl.textContent = `Welcome back, ${firstName}!`;
  }
}

/**
 * Handle user logout
 */
function handleLogout(event) {
  if (event) event.preventDefault();

  console.log("[Auth] Logging out...");

  // Clear state
  AppState.user = { user_id: null, user_type: null, user_email: null };
  AppState.complaints = [];

  // Clear localStorage
  localStorage.removeItem("user_id");
  localStorage.removeItem("user_type");
  localStorage.removeItem("user_email");

  // Stop auto-refresh
  stopAutoRefresh();

  // Redirect
  window.location.href = "login.html";
}

// ============================================================================
// API HELPERS
// ============================================================================

/**
 * Generic API request with retry logic and error handling
 * @param {string} endpoint - API endpoint
 * @param {object} options - Fetch options
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<object>} API response
 */
async function apiRequest(endpoint, options = {}, retryCount = 0) {
  const url = `${CONFIG.API_BASE_URL}${endpoint}`;

  try {
    console.log(`[API] Request: ${options.method || 'GET'} ${endpoint}`);

    const response = await fetch(url, {
      credentials: "include",
      ...options,
    });

    console.log(`[API] Response: ${response.status} ${endpoint}`);

    // Handle HTTP errors
    if (response.status === 401 || response.status === 403) {
      handleSessionExpired();
      throw new Error("Session expired");
    }

    if (!response.ok && response.status >= 500) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();

    // Handle backend errors
    if (!data.success && data.message) {
      throw new Error(data.message);
    }

    return data;
  } catch (error) {
    console.error(`[API] Request failed (attempt ${retryCount + 1}):`, error.message);

    // Retry logic
    if (retryCount < CONFIG.RETRY_ATTEMPTS && error.message.includes("Server error")) {
      console.log(`[API] Retrying in ${CONFIG.RETRY_DELAY}ms...`);
      await delay(CONFIG.RETRY_DELAY * (retryCount + 1)); // Exponential backoff
      return apiRequest(endpoint, options, retryCount + 1);
    }

    throw error;
  }
}

/**
 * Delay helper for retry logic
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// COMPLAINTS MANAGEMENT
// ============================================================================

/**
 * Load complaints from backend
 * @param {boolean} force - Force refresh, bypass cache
 */
async function loadComplaints(force = false) {
  // Prevent concurrent fetches
  if (AppState.isLoading) {
    console.log("[Complaints] Already loading, skipping...");
    return;
  }

  // Check cache
  const now = Date.now();
  if (!force && AppState.lastFetch && (now - AppState.lastFetch) < CONFIG.CACHE_TTL) {
    console.log("[Complaints] Using cached data");
    return;
  }

  AppState.isLoading = true;

  // Abort previous request if any
  if (AppState.abortController) {
    AppState.abortController.abort();
  }
  AppState.abortController = new AbortController();

  // UI: Show loading
  const complaintsLoadingMsg = document.getElementById("complaintsLoadingMessage");
  const complaintsEmptyMsg = document.getElementById("complaintsEmptyMessage");
  const complaintsList = document.getElementById("complaintsList");

  if (complaintsLoadingMsg) complaintsLoadingMsg.style.display = "block";
  if (complaintsEmptyMsg) complaintsEmptyMsg.style.display = "none";
  if (complaintsList) complaintsList.innerHTML = "";

  console.log("[Complaints] Fetching complaints...");

  try {
    const data = await apiRequest("/api/get_complaints.php", {
      method: "GET",
      signal: AppState.abortController.signal,
    });

    console.log("[Complaints] Received data:", data);

    // Update state
    AppState.complaints = data.complaints || [];
    AppState.lastFetch = Date.now();

    // UI: Hide loading
    if (complaintsLoadingMsg) complaintsLoadingMsg.style.display = "none";

    // UI: Render complaints
    if (AppState.complaints.length > 0) {
      renderComplaints(AppState.complaints);
    } else {
      if (complaintsEmptyMsg) complaintsEmptyMsg.style.display = "block";
    }

    console.log(`[Complaints] Loaded ${AppState.complaints.length} complaints`);
  } catch (error) {
    if (error.name === "AbortError") {
      console.log("[Complaints] Request aborted");
      return;
    }

    console.error("[Complaints] Load failed:", error);

    // UI: Show error
    if (complaintsLoadingMsg) {
      complaintsLoadingMsg.textContent = `Error: ${error.message}. Click refresh to try again.`;
      complaintsLoadingMsg.style.color = "var(--primary)";
    }
  } finally {
    AppState.isLoading = false;
    AppState.abortController = null;
  }
}

/**
 * Render complaints list
 * @param {Array} complaints - Array of complaint objects
 */
function renderComplaints(complaints) {
  const complaintsList = document.getElementById("complaintsList");
  if (!complaintsList) return;

  const html = complaints.map((complaint) => renderComplaintItem(complaint)).join("");
  complaintsList.innerHTML = html;

  console.log("[Complaints] Rendered", complaints.length, "items");
}

/**
 * Render individual complaint card
 * @param {object} complaint - Complaint object
 * @returns {string} HTML string
 */
function renderComplaintItem(complaint) {
  const createdDate = new Date(complaint.created_at);
  const formattedDate = formatRelativeTime(createdDate);

  return `
    <div class="complaint-item" data-id="${escapeHtml(complaint.complaint_id || '')}">
      <h3>${escapeHtml(complaint.title || 'Untitled')}</h3>
      <div class="complaint-meta">
        <span><strong>Type:</strong> ${escapeHtml(complaint.complaint_type || 'N/A')}</span>
        <span><strong>Status:</strong> <span class="complaint-status ${complaint.status || 'pending'}">${escapeHtml(complaint.status || 'pending')}</span></span>
        <span><strong>Submitted:</strong> ${formattedDate}</span>
        ${complaint.location ? `<span><strong>Location:</strong> ${escapeHtml(complaint.location)}</span>` : ''}
      </div>
    </div>
  `;
}

/**
 * Handle complaint form submission
 * @param {Event} event - Form submit event
 */
async function handleComplaintSubmit(event) {
  event.preventDefault();

  // Prevent double submissions
  if (AppState.isSubmitting) {
    console.log("[Complaint] Already submitting, ignoring...");
    return;
  }

  const form = event.target;
  const complaintMessage = document.getElementById("complaintMessage");
  const submitBtn = document.getElementById("submitComplaintBtn");

  // Get form values
  const title = document.getElementById("title").value.trim();
  const complaint_type = document.getElementById("complaint_type").value.trim();
  const description = document.getElementById("description").value.trim();
  const location = document.getElementById("location").value.trim();

  // Validation
  if (!title || !complaint_type || !description) {
    showError(complaintMessage, "Please fill in all required fields");
    return;
  }

  if (title.length < 5) {
    showError(complaintMessage, "Title must be at least 5 characters long");
    return;
  }

  if (description.length < 10) {
    showError(complaintMessage, "Description must be at least 10 characters long");
    return;
  }

  AppState.isSubmitting = true;

  // UI: Disable button
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";
  hideMessage(complaintMessage);

  // Prepare FormData
  const formData = new FormData();
  formData.append("title", title);
  formData.append("complaint_type", complaint_type);
  formData.append("description", description);
  if (location) {
    formData.append("location", location);
  }

  console.log("[Complaint] Submitting:", { title, complaint_type, description, location });

  try {
    const data = await apiRequest("/api/submit_complaint.php", {
      method: "POST",
      body: formData,
    });

    console.log("[Complaint] Submitted successfully:", data);

    // UI: Show success
    showSuccess(complaintMessage, "Complaint submitted successfully!");

    // Reset form
    form.reset();

    // Reload complaints after delay
    setTimeout(async () => {
      await loadComplaints(true); // Force refresh
      hideMessage(complaintMessage);
      document.getElementById("complaintFormSection").style.display = "none";
    }, 2000);
  } catch (error) {
    console.error("[Complaint] Submission failed:", error);
    showError(complaintMessage, error.message || "Failed to submit complaint. Please try again.");
  } finally {
    AppState.isSubmitting = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Complaint";
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

/**
 * Initialize all event listeners
 */
function initEventListeners() {
  console.log("[Events] Initializing listeners...");

  // Logout button
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }

  // Toggle complaint form
  const toggleComplaintFormBtn = document.getElementById("toggleComplaintFormBtn");
  const closeComplaintFormBtn = document.getElementById("closeComplaintFormBtn");
  const complaintFormSection = document.getElementById("complaintFormSection");

  if (toggleComplaintFormBtn && complaintFormSection) {
    toggleComplaintFormBtn.addEventListener("click", () => {
      complaintFormSection.style.display = "block";
      complaintFormSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  if (closeComplaintFormBtn && complaintFormSection) {
    closeComplaintFormBtn.addEventListener("click", () => {
      complaintFormSection.style.display = "none";
      const form = document.getElementById("complaintForm");
      if (form) form.reset();
      hideMessage(document.getElementById("complaintMessage"));
    });
  }

  // Complaint form submission
  const complaintForm = document.getElementById("complaintForm");
  if (complaintForm) {
    complaintForm.addEventListener("submit", handleComplaintSubmit);
  }

  // Refresh complaints button
  const refreshComplaintsBtn = document.getElementById("refreshComplaintsBtn");
  if (refreshComplaintsBtn) {
    refreshComplaintsBtn.addEventListener("click", () => {
      console.log("[Events] Manual refresh triggered");
      loadComplaints(true); // Force refresh
    });
  }

  console.log("[Events] Listeners initialized");
}

// ============================================================================
// AUTO-REFRESH
// ============================================================================

/**
 * Start auto-refresh interval
 */
function startAutoRefresh() {
  if (AppState.refreshInterval) {
    console.log("[AutoRefresh] Already running");
    return;
  }

  AppState.refreshInterval = setInterval(() => {
    console.log("[AutoRefresh] Refreshing complaints...");
    loadComplaints(true);
  }, CONFIG.AUTO_REFRESH_INTERVAL);

  console.log(`[AutoRefresh] Started (every ${CONFIG.AUTO_REFRESH_INTERVAL / 1000}s)`);
}

/**
 * Stop auto-refresh interval
 */
function stopAutoRefresh() {
  if (AppState.refreshInterval) {
    clearInterval(AppState.refreshInterval);
    AppState.refreshInterval = null;
    console.log("[AutoRefresh] Stopped");
  }
}

// ============================================================================
// ONLINE/OFFLINE MONITORING
// ============================================================================

/**
 * Monitor online/offline status
 */
function monitorOnlineStatus() {
  window.addEventListener("online", () => {
    console.log("[Network] Back online");
    showGlobalSuccess("You're back online!");
    loadComplaints(true); // Refresh data
    setTimeout(hideGlobalMessage, 3000);
  });

  window.addEventListener("offline", () => {
    console.log("[Network] Offline");
    showGlobalError("You're offline. Some features may not work.");
  });
}

// ============================================================================
// UI UTILITIES
// ============================================================================

/**
 * Show error message in an element
 * @param {HTMLElement} element - Target element
 * @param {string} message - Error message
 */
function showError(element, message) {
  if (!element) return;
  element.textContent = message;
  element.style.display = "block";
  element.className = "message-box error";
}

/**
 * Show success message in an element
 * @param {HTMLElement} element - Target element
 * @param {string} message - Success message
 */
function showSuccess(element, message) {
  if (!element) return;
  element.textContent = message;
  element.style.display = "block";
  element.className = "message-box success";
}

/**
 * Hide message element
 * @param {HTMLElement} element - Target element
 */
function hideMessage(element) {
  if (!element) return;
  element.style.display = "none";
}

/**
 * Show global error toast
 * @param {string} message - Error message
 */
function showGlobalError(message) {
  showGlobalMessage(message, "error");
}

/**
 * Show global success toast
 * @param {string} message - Success message
 */
function showGlobalSuccess(message) {
  showGlobalMessage(message, "success");
}

/**
 * Show global toast message
 * @param {string} message - Message text
 * @param {string} type - Message type (error|success)
 */
function showGlobalMessage(message, type = "error") {
  let toast = document.getElementById("globalToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "globalToast";
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      z-index: 9999;
      max-width: 400px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideIn 0.3s ease;
    `;

    const style = document.createElement("style");
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.display = "block";

  if (type === "success") {
    toast.style.background = "linear-gradient(135deg, #4caf50, #388e3c)";
    toast.style.color = "#ffffff";
  } else {
    toast.style.background = "linear-gradient(135deg, #f44336, #d32f2f)";
    toast.style.color = "#ffffff";
  }
}

/**
 * Hide global toast
 */
function hideGlobalMessage() {
  const toast = document.getElementById("globalToast");
  if (toast) toast.style.display = "none";
}

// ============================================================================
// HELPER UTILITIES
// ============================================================================

/**
 * Escape HTML to prevent XSS
 * @param {string} unsafe - Potentially unsafe string
 * @returns {string} Escaped string
 */
function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Format date as relative time
 * @param {Date} date - Date object
 * @returns {string} Formatted string (e.g., "2 hours ago")
 */
function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

// ============================================================================
// PAGE VISIBILITY (PAUSE REFRESH WHEN TAB HIDDEN)
// ============================================================================

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    console.log("[Visibility] Page hidden, pausing auto-refresh");
    stopAutoRefresh();
  } else {
    console.log("[Visibility] Page visible, resuming auto-refresh");
    startAutoRefresh();
    loadComplaints(true); // Refresh on return
  }
});
