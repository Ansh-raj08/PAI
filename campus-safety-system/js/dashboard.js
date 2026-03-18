/**
 * Campus Safety Dashboard - Production Version
 * Handles user authentication, complaint management, and UI interactions
 * @version 2.0.0
 */

console.log("[Dashboard] Module loaded");

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


// =======================
// AUTHENTICATION CHECK
// =======================
function checkAuthentication() {
  const userId = localStorage.getItem("user_id");
  if (!userId) {
    console.log("User not authenticated. Redirecting to login...");
    window.location.href = "login.html";
    return;
  }
  console.log("User authenticated. User ID:", userId);
}

// =======================
// USER INFO
// =======================
function loadUserInfo() {
  userInfo.user_id = localStorage.getItem("user_id");
  userInfo.user_type = localStorage.getItem("user_type");
  userInfo.user_email = localStorage.getItem("user_email");

  // Update UI
  const userEmailEl = document.getElementById("userEmail");
  const userIdEl = document.getElementById("userId");
  const userTypeEl = document.getElementById("userType");
  const welcomeMessageEl = document.getElementById("welcomeMessage");

  if (userEmailEl) userEmailEl.textContent = userInfo.user_email || "N/A";
  if (userIdEl) userIdEl.textContent = userInfo.user_id || "N/A";
  if (userTypeEl)
    userTypeEl.textContent = (userInfo.user_type || "student").toUpperCase();
  if (welcomeMessageEl) {
    welcomeMessageEl.textContent = `Welcome back, ${
      userInfo.user_email?.split("@")[0] || "Student"
    }!`;
  }

  console.log("User info loaded:", userInfo);
}

// =======================
// EVENT LISTENERS
// =======================
function initEventListeners() {
  // Logout button
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleLogout();
    });
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
      // Clear form
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
      loadComplaints();
    });
  }
}

// =======================
// LOGOUT
// =======================
function handleLogout() {
  console.log("Logging out...");
  localStorage.removeItem("user_id");
  localStorage.removeItem("user_type");
  localStorage.removeItem("user_email");
  window.location.href = "login.html";
}

// =======================
// LOAD COMPLAINTS
// =======================
async function loadComplaints() {
  const complaintsLoadingMsg = document.getElementById("complaintsLoadingMessage");
  const complaintsEmptyMsg = document.getElementById("complaintsEmptyMessage");
  const complaintsList = document.getElementById("complaintsList");

  // Show loading
  if (complaintsLoadingMsg) complaintsLoadingMsg.style.display = "block";
  if (complaintsEmptyMsg) complaintsEmptyMsg.style.display = "none";
  if (complaintsList) complaintsList.innerHTML = "";

  console.log("Fetching complaints...");

  try {
    const response = await fetch(`${API_BASE_URL}/api/get_complaints.php`, {
      method: "GET",
      credentials: "include", // Include session cookies
    });

    console.log("Get complaints response status:", response.status);

    const data = await response.json();
    console.log("Get complaints response data:", data);

    // Hide loading
    if (complaintsLoadingMsg) complaintsLoadingMsg.style.display = "none";

    if (data.success && data.complaints && data.complaints.length > 0) {
      // Render complaints
      if (complaintsList) {
        complaintsList.innerHTML = data.complaints
          .map((complaint) => renderComplaint(complaint))
          .join("");
      }
    } else {
      // Show empty message
      if (complaintsEmptyMsg) complaintsEmptyMsg.style.display = "block";
    }
  } catch (error) {
    console.error("Error fetching complaints:", error);
    if (complaintsLoadingMsg) {
      complaintsLoadingMsg.textContent =
        "Error loading complaints. Please try again.";
      complaintsLoadingMsg.style.color = "var(--primary)";
    }
  }
}

// =======================
// RENDER COMPLAINT ITEM
// =======================
function renderComplaint(complaint) {
  const createdDate = new Date(complaint.created_at);
  const formattedDate = createdDate.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `
    <div class="complaint-item">
      <h3>${escapeHtml(complaint.title)}</h3>
      <div class="complaint-meta">
        <span><strong>Type:</strong> ${escapeHtml(
          complaint.complaint_type || "N/A"
        )}</span>
        <span><strong>Status:</strong> <span class="complaint-status ${
          complaint.status
        }">${escapeHtml(complaint.status || "pending")}</span></span>
        <span><strong>Submitted:</strong> ${formattedDate}</span>
      </div>
    </div>
  `;
}

// =======================
// SUBMIT COMPLAINT
// =======================
async function handleComplaintSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const complaintMessage = document.getElementById("complaintMessage");
  const submitBtn = document.getElementById("submitComplaintBtn");

  // Get form values
  const title = document.getElementById("title").value.trim();
  const complaint_type = document.getElementById("complaint_type").value;
  const description = document.getElementById("description").value.trim();
  const location = document.getElementById("location").value.trim();

  // Validation
  if (!title || !complaint_type || !description) {
    showError(complaintMessage, "Please fill in all required fields");
    return;
  }

  // Disable button
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

  console.log("Submitting complaint:", { title, complaint_type, description, location });

  try {
    const response = await fetch(`${API_BASE_URL}/api/submit_complaint.php`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    console.log("Submit complaint response status:", response.status);

    const data = await response.json();
    console.log("Submit complaint response data:", data);

    if (data.success) {
      // Show success message
      showSuccess(complaintMessage, "Complaint submitted successfully!");

      // Reset form
      form.reset();

      // Reload complaints
      setTimeout(() => {
        loadComplaints();
        hideMessage(complaintMessage);
        document.getElementById("complaintFormSection").style.display = "none";
      }, 2000);
    } else {
      showError(
        complaintMessage,
        data.message || "Failed to submit complaint. Please try again."
      );
    }

    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Complaint";
  } catch (error) {
    console.error("Error submitting complaint:", error);
    showError(
      complaintMessage,
      "Network error. Please check your connection and try again."
    );
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Complaint";
  }
}

// =======================
// UTILITY FUNCTIONS
// =======================

function showError(element, message) {
  if (!element) return;
  element.textContent = message;
  element.style.display = "block";
  element.className = "message-box error";
}

function showSuccess(element, message) {
  if (!element) return;
  element.textContent = message;
  element.style.display = "block";
  element.className = "message-box success";
}

function hideMessage(element) {
  if (!element) return;
  element.style.display = "none";
}

function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
