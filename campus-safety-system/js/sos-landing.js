const API_BASE_URL = "http://localhost:8000";

// State
let isProcessing = false;

function triggerSOS() {
  const button = document.getElementById("sosButton");
  if (!button || isProcessing) return;

  // Visual feedback: pressed animation
  button.classList.add("is-pressed");
  window.setTimeout(() => {
    button.classList.remove("is-pressed");
  }, 180);

  // Start SOS process
  isProcessing = true;
  button.disabled = true;

  console.log("=== SOS TRIGGER INITIATED ===");

  // Update button text to show status
  const sosLabel = button.querySelector(".sos-label");
  if (sosLabel) sosLabel.textContent = "Getting location...";

  // Check if geolocation is available
  if (!navigator.geolocation) {
    console.error("Geolocation not supported");
    showSOSMessage("error", "Geolocation is not supported by your browser");
    resetSOSButton(button, sosLabel);
    return;
  }

  // Get current position
  navigator.geolocation.getCurrentPosition(
    (position) => {
      // Success: got location
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      console.log("Location captured:", { latitude, longitude, accuracy });

      if (sosLabel) sosLabel.textContent = "Sending alert...";

      // Send SOS to backend
      sendSOSToBackend(latitude, longitude, button, sosLabel);
    },
    (error) => {
      // Error getting location
      console.error("Geolocation error:", error);

      let errorMessage = "Unable to get your location";
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = "Location permission denied. Please enable location access.";
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = "Location information unavailable.";
          break;
        case error.TIMEOUT:
          errorMessage = "Location request timed out.";
          break;
      }

      showSOSMessage("error", errorMessage);
      resetSOSButton(button, sosLabel);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000, // 10 seconds
      maximumAge: 0,
    }
  );
}

async function sendSOSToBackend(latitude, longitude, button, sosLabel) {
  const locationString = `Lat: ${latitude.toFixed(6)}, Long: ${longitude.toFixed(
    6
  )}`;

  console.log("Sending SOS to backend...");
  console.log("Request payload:", {
    latitude,
    longitude,
    location: locationString,
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/trigger_emergency.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include", // Include session cookies
      body: JSON.stringify({
        latitude: latitude,
        longitude: longitude,
        location: locationString,
      }),
    });

    console.log("SOS response status:", response.status);

    const data = await response.json();
    console.log("SOS response data:", data);

    if (data.success) {
      // Success!
      showSOSMessage(
        "success",
        "SOS Alert sent successfully! Campus security has been notified and help is on the way."
      );
      console.log("=== SOS SENT SUCCESSFULLY ===");
    } else {
      // Backend error
      showSOSMessage(
        "error",
        data.message || "Failed to send SOS. Please try again."
      );
      console.error("SOS failed:", data.message);
    }

    resetSOSButton(button, sosLabel);
  } catch (error) {
    // Network error
    console.error("Network error:", error);
    showSOSMessage(
      "error",
      "Network error. Please check your connection and try again."
    );
    resetSOSButton(button, sosLabel);
  }
}

function resetSOSButton(button, sosLabel) {
  isProcessing = false;
  if (button) button.disabled = false;
  if (sosLabel) sosLabel.textContent = "SOS";
}

function showSOSMessage(type, message) {
  // Create message element if it doesn't exist
  let messageEl = document.getElementById("sosMessage");

  if (!messageEl) {
    messageEl = document.createElement("div");
    messageEl.id = "sosMessage";
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

    // Add CSS for animation
    if (!document.getElementById("sosMessageStyles")) {
      const style = document.createElement("style");
      style.id = "sosMessageStyles";
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

  // Set message content and style
  messageEl.textContent = message;

  if (type === "success") {
    messageEl.style.background = "linear-gradient(135deg, #4caf50, #388e3c)";
    messageEl.style.color = "#ffffff";
  } else {
    messageEl.style.background = "linear-gradient(135deg, #f44336, #d32f2f)";
    messageEl.style.color = "#ffffff";
  }

  // Show message
  messageEl.style.display = "block";

  // Auto-hide after 5 seconds
  setTimeout(() => {
    if (messageEl) {
      messageEl.style.display = "none";
    }
  }, 5000);
}
