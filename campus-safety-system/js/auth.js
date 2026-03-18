// Authentication-related scripts
console.log("auth.js loaded");

const API_BASE_URL = "http://localhost:8000";

// Determine which page we're on
const isLoginPage = window.location.pathname.includes("login.html");
const isSignupPage = window.location.pathname.includes("signup.html");

// Initialize page-specific handlers
document.addEventListener("DOMContentLoaded", () => {
  if (isLoginPage) {
    initLoginPage();
  } else if (isSignupPage) {
    initSignupPage();
  }
});

// =======================
// LOGIN PAGE
// =======================
function initLoginPage() {
  const loginForm = document.getElementById("loginForm");
  const errorMessage = document.getElementById("errorMessage");
  const submitBtn = document.getElementById("submitBtn");

  if (!loginForm) {
    console.error("Login form not found");
    return;
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Get form values
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    // Basic validation
    if (!email || !password) {
      showError(errorMessage, "Please fill in all fields");
      return;
    }

    if (!validateEmail(email)) {
      showError(errorMessage, "Please enter a valid email address");
      return;
    }

    // Disable button and show loading state
    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in...";
    hideMessage(errorMessage);

    // Prepare FormData
    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);

    console.log("Attempting login for:", email);

    try {
      const response = await fetch(`${API_BASE_URL}/api/login.php`, {
        method: "POST",
        body: formData,
        credentials: "include", // Include cookies for session
      });

      console.log("Login response status:", response.status);

      const data = await response.json();
      console.log("Login response data:", data);

      if (data.success) {
        // Store user info in localStorage
        localStorage.setItem("user_id", data.user_id);
        localStorage.setItem("user_type", data.user_type);
        localStorage.setItem("user_email", email);

        console.log("Login successful. Redirecting to dashboard...");

        // Redirect to dashboard
        window.location.href = "dashboard.html";
      } else {
        // Show error message
        showError(errorMessage, data.message || "Login failed. Please try again.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Login";
      }
    } catch (error) {
      console.error("Login error:", error);
      showError(
        errorMessage,
        "Network error. Please check your connection and try again."
      );
      submitBtn.disabled = false;
      submitBtn.textContent = "Login";
    }
  });
}

// =======================
// SIGNUP PAGE
// =======================
function initSignupPage() {
  const signupForm = document.getElementById("signupForm");
  const messageBox = document.getElementById("messageBox");
  const submitBtn = document.getElementById("submitBtn");

  if (!signupForm) {
    console.error("Signup form not found");
    return;
  }

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Get form values
    const full_name = document.getElementById("full_name").value.trim();
    const roll_number = document.getElementById("roll_number").value.trim();
    const email = document.getElementById("signup_email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const password = document.getElementById("signup_password").value;

    // Validation
    if (!full_name || !roll_number || !email || !password) {
      showError(messageBox, "Please fill in all required fields");
      return;
    }

    if (!validateEmail(email)) {
      showError(messageBox, "Please enter a valid email address");
      return;
    }

    if (password.length < 6) {
      showError(messageBox, "Password must be at least 6 characters long");
      return;
    }

    // Disable button and show loading state
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account...";
    hideMessage(messageBox);

    // Prepare FormData
    const formData = new FormData();
    formData.append("full_name", full_name);
    formData.append("roll_number", roll_number);
    formData.append("email", email);
    formData.append("password", password);
    if (phone) {
      formData.append("phone", phone);
    }

    console.log("Attempting signup for:", email);

    try {
      const response = await fetch(`${API_BASE_URL}/api/signup.php`, {
        method: "POST",
        body: formData,
      });

      console.log("Signup response status:", response.status);

      const data = await response.json();
      console.log("Signup response data:", data);

      if (data.success) {
        // Show success message
        showSuccess(
          messageBox,
          "Account created successfully! Redirecting to login..."
        );

        // Redirect to login after 2 seconds
        setTimeout(() => {
          window.location.href = "login.html";
        }, 2000);
      } else {
        // Show error message
        showError(messageBox, data.message || "Signup failed. Please try again.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign Up";
      }
    } catch (error) {
      console.error("Signup error:", error);
      showError(
        messageBox,
        "Network error. Please check your connection and try again."
      );
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign Up";
    }
  });
}

// =======================
// UTILITY FUNCTIONS
// =======================

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function showError(element, message) {
  if (!element) return;
  element.textContent = message;
  element.style.display = "block";
  element.style.background = "rgba(211, 47, 47, 0.1)";
  element.style.border = "1px solid rgba(211, 47, 47, 0.3)";
  element.style.color = "var(--primary)";
}

function showSuccess(element, message) {
  if (!element) return;
  element.textContent = message;
  element.style.display = "block";
  element.style.background = "rgba(76, 175, 80, 0.1)";
  element.style.border = "1px solid rgba(76, 175, 80, 0.3)";
  element.style.color = "#388e3c";
}

function hideMessage(element) {
  if (!element) return;
  element.style.display = "none";
}
