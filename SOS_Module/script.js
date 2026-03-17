function triggerSOS() {
    const button = document.getElementById("sosButton");
    if (!button) return;

    button.classList.add("is-pressed");
    window.setTimeout(() => {
        button.classList.remove("is-pressed");
    }, 180);

    // Placeholder: replace with backend call to backend/api/trigger_emergency.php
    console.log("SOS trigger placeholder executed.");
    window.alert("SOS initiated. Campus security has been notified.");
}
