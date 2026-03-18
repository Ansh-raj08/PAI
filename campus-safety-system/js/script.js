// Landing page interactions: mobile navigation, smooth scroll, and small UI polish.
(function () {
    const menuToggle = document.getElementById("menuToggle");
    const mainNav = document.getElementById("mainNav");
    const siteHeader = document.getElementById("siteHeader");
    const navLinks = document.querySelectorAll(".main-nav a");
    const actionButtons = document.querySelectorAll(".btn");

    if (menuToggle && mainNav) {
        menuToggle.addEventListener("click", function () {
            const isOpen = mainNav.classList.toggle("open");
            menuToggle.setAttribute("aria-expanded", String(isOpen));
        });

        navLinks.forEach(function (link) {
            link.addEventListener("click", function () {
                mainNav.classList.remove("open");
                menuToggle.setAttribute("aria-expanded", "false");
            });
        });
    }

    function updateHeaderShadow() {
        if (!siteHeader) return;
        if (window.scrollY > 8) {
            siteHeader.classList.add("scrolled");
        } else {
            siteHeader.classList.remove("scrolled");
        }
    }

    function scrollToSection(event) {
        const href = event.currentTarget.getAttribute("href");
        if (!href || !href.startsWith("#")) return;
        const target = document.querySelector(href);
        if (!target) return;

        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    navLinks.forEach(function (link) {
        link.addEventListener("click", scrollToSection);
    });

    actionButtons.forEach(function (button) {
        button.addEventListener("mouseenter", function () {
            button.classList.add("btn-glow");
        });
        button.addEventListener("mouseleave", function () {
            button.classList.remove("btn-glow");
        });
    });

    window.addEventListener("scroll", updateHeaderShadow);
    updateHeaderShadow();
})();
