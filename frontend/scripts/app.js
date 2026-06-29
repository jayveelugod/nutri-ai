// Dynamically resolve backend so external devices hit the right host automatically
// Dynamic API URL for Local vs Vercel
let API_BASE_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? window.location.protocol + "//" + window.location.hostname + ":8000"
    : "";

API_BASE_URL = `${API_BASE_URL}/api`

// --- GLOBAL FOOTER LOADING ---
if ($('#footerContainer').length > 0) {
    $('#footerContainer').load('footer.html', function () {
        const path = window.location.pathname.split('/').pop() || '/index.html';
        $('.bottom-nav .nav-btn').removeClass('active text-success text-white').addClass('text-muted');

        let activeTarget = 'index';
        if (path.includes('scanner')) activeTarget = 'scanner';
        else if (path.includes('progress')) activeTarget = 'progress';
        else if (path.includes('profile')) activeTarget = 'profile';

        const activeBtn = $(`.bottom-nav .nav-btn[data-nav="${activeTarget}"]`);
        if (activeTarget === 'scanner') {
            activeBtn.removeClass('text-muted').addClass('text-white bg-success shadow-sm');
        } else {
            activeBtn.removeClass('text-muted').addClass('active text-success');
        }
    });
}

// --- PASSWORD STRENGTH & MEDICAL CONDITIONS UTILITIES ---
function isStrongPassword(password) {
    if (password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/\d/.test(password)) return false;
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return false;
    return true;
}

function setupPasswordStrengthValidation(inputSelector) {
    const $input = $(inputSelector);
    if ($input.length === 0) return;

    const $formGroup = $input.closest('.mb-3, .mb-4, .mb-2, .mb-5');
    let $container = $formGroup.find('.password-strength-container');
    if ($container.length === 0) {
        $container = $(`
            <div class="password-strength-container mt-2 d-none">
                <div class="progress mb-2" style="height: 6px; border-radius: 3px; background-color: #e9ecef;">
                    <div class="progress-bar" role="progressbar" style="width: 0%; transition: width 0.3s ease, background-color 0.3s ease;" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="password-feedback small fw-bold text-muted" style="font-size: 0.75rem;">Too Weak</span>
                    <span class="password-percentage small text-muted" style="font-size: 0.75rem;">0%</span>
                </div>
                <ul class="password-requirements list-unstyled small text-muted mb-0 ps-1" style="font-size: 0.75rem; line-height: 1.4;">
                    <li class="req-length mb-1"><span class="badge bg-secondary-subtle text-secondary me-1 px-1">✕</span> At least 8 characters</li>
                    <li class="req-upper mb-1"><span class="badge bg-secondary-subtle text-secondary me-1 px-1">✕</span> At least one uppercase letter</li>
                    <li class="req-lower mb-1"><span class="badge bg-secondary-subtle text-secondary me-1 px-1">✕</span> At least one lowercase letter</li>
                    <li class="req-number mb-1"><span class="badge bg-secondary-subtle text-secondary me-1 px-1">✕</span> At least one number</li>
                    <li class="req-special mb-0"><span class="badge bg-secondary-subtle text-secondary me-1 px-1">✕</span> At least one special character</li>
                </ul>
            </div>
        `);
        $formGroup.append($container);
    }

    $input.on('focus input', function () {
        const val = $input.val();
        if (val.length === 0) {
            $container.addClass('d-none');
            return;
        }
        $container.removeClass('d-none');

        const checks = {
            length: val.length >= 8,
            upper: /[A-Z]/.test(val),
            lower: /[a-z]/.test(val),
            number: /\d/.test(val),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(val)
        };

        let score = 0;
        for (const [key, met] of Object.entries(checks)) {
            const $item = $container.find(`.req-${key}`);
            const $badge = $item.find('.badge');
            if (met) {
                score++;
                $badge.removeClass('bg-secondary-subtle text-secondary').addClass('bg-success-subtle text-success').text('✓');
                $item.removeClass('text-muted').addClass('text-success fw-medium');
            } else {
                $badge.removeClass('bg-success-subtle text-success').addClass('bg-secondary-subtle text-secondary').text('✕');
                $item.removeClass('text-success fw-medium').addClass('text-muted');
            }
        }

        const pct = (score / 5) * 100;
        const $bar = $container.find('.progress-bar');
        $bar.css('width', `${pct}%`).attr('aria-valuenow', pct);
        $container.find('.password-percentage').text(`${pct}%`);

        const $feedback = $container.find('.password-feedback');
        $bar.removeClass('bg-danger bg-warning bg-success bg-info');
        if (score === 0) {
            $bar.addClass('bg-danger');
            $feedback.text('Too Weak').removeClass().addClass('password-feedback small fw-bold text-danger');
        } else if (score <= 2) {
            $bar.addClass('bg-danger');
            $feedback.text('Weak').removeClass().addClass('password-feedback small fw-bold text-danger');
        } else if (score <= 4) {
            $bar.addClass('bg-warning');
            $feedback.text('Medium').removeClass().addClass('password-feedback small fw-bold text-warning');
        } else {
            $bar.addClass('bg-success');
            $feedback.text('Strong & Secure!').removeClass().addClass('password-feedback small fw-bold text-success');
        }
    });
}

async function populateMedicalConditions(containerSelector, dropdownButtonTextSelector, selectedValueStr = "") {
    try {
        const res = await fetch(`${API_BASE_URL}/medical-conditions`);
        const conditions = await res.json();

        const $container = $(containerSelector);
        if ($container.length === 0) return;
        $container.empty();

        const selectedVals = selectedValueStr ? selectedValueStr.split(',').map(s => s.trim()) : [];

        conditions.forEach(cond => {
            const isChecked = selectedVals.includes(cond.name) ? 'checked' : '';
            $container.append(`
                <div class="form-check mb-2">
                    <input class="form-check-input condition-checkbox" type="checkbox" value="${cond.name}" id="cond_${cond.id}" ${isChecked}>
                    <label class="form-check-label w-100" style="cursor: pointer;" for="cond_${cond.id}">
                        <span class="fw-semibold text-dark small">${cond.name}</span>
                        <small class="text-muted d-block" style="font-size: 0.65rem; line-height: 1.2;">${cond.description || ''}</small>
                    </label>
                </div>
            `);
        });

        updateDropdownButtonText(containerSelector, dropdownButtonTextSelector);

        $container.off('change', '.condition-checkbox').on('change', '.condition-checkbox', function () {
            updateDropdownButtonText(containerSelector, dropdownButtonTextSelector);
        });
    } catch (err) {
        console.error("Failed to populate medical conditions", err);
    }
}

function updateDropdownButtonText(containerSelector, dropdownButtonTextSelector) {
    const selected = [];
    $(`${containerSelector} .condition-checkbox:checked`).each(function () {
        selected.push($(this).val());
    });

    const $btnText = $(dropdownButtonTextSelector);
    if (selected.length > 0) {
        selected.sort();
        $btnText.text(selected.join(', '));
    } else {
        $btnText.text('Select Medical Conditions');
    }
}

// Toggle password visibility handler
$(document).on('click', '.toggle-password', function () {
    const $btn = $(this);
    const $input = $btn.closest('.input-group').find('input');
    if ($input.length === 0) return;

    const isPassword = $input.attr('type') === 'password';
    $input.attr('type', isPassword ? 'text' : 'password');

    if (isPassword) {
        $btn.html(`
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eye-slash" viewBox="0 0 16 16">
                <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a8.8 8.8 0 0 0-2.79.448l1.018 1.018A6.8 6.8 0 0 1 8 3.5c4 0 7.151 3.57 8 4.5a10.7 10.7 0 0 1-2.905 3.485zm-2.068-2.068L12.43 10.3A3.5 3.5 0 0 0 8 5.582l1.57 1.57c.127.182.223.385.29.6z"/>
                <path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829zm-2.943-2.943-.824-.824a5.1 5.1 0 0 0-3.393 2.062L1.122 6.029A11.7 11.7 0 0 0 0 8s3 5.5 8 5.5a8.7 8.7 0 0 0 5.258-1.743l-1.057-1.057a7.8 7.8 0 0 1-4.201 1.205c-4.137 0-7.263-3.57-8-4.5.766-.975 2.029-2.3 3.869-3.29l.753.753a5 5 0 0 0-1.897 1.897L5.05 8c.036-.08.083-.153.139-.219z"/>
                <path d="M13.646 14.354l-12-12 .708-.708 12 12-.708.708z"/>
            </svg>
        `);
    } else {
        $btn.html(`
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eye" viewBox="0 0 16 16">
                <path d="M16 8s-3-5.5-8-5.5S0 8s3 5.5 8 5.5S16 8 16 8M1.173 8a13 13 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5s3.879 1.168 5.168 2.457A13 13 0 0 1 14.828 8q-.086.13-.195.288c-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5s-3.879-1.168-5.168-2.457A13 13 0 0 1 1.173 8"/>
                <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0"/>
            </svg>
        `);
    }
});

// --- TOAST UTILITY ---
function showToast(message, type = "success") {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container position-fixed top-0 end-0 p-3 mt-5';
        container.style.zIndex = '1060';
        document.body.appendChild(container);
    }

    const toastEl = document.createElement('div');
    toastEl.className = `toast align-items-center text-bg-${type} border-0 shadow`;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');

    toastEl.innerHTML = `
      <div class="d-flex">
        <div class="toast-body fw-bold">
          ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    `;

    container.appendChild(toastEl);
    const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
    toast.show();

    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}

// --- AUTHENTICATION UTILS ---
function getToken() {
    return localStorage.getItem('nutri_token');
}

function setToken(token) {
    localStorage.setItem('nutri_token', token);
}

function removeToken() {
    localStorage.removeItem('nutri_token');
}

function checkAuth() {
    const token = getToken();
    const isAuthPage = window.location.pathname.includes('/login.html') || window.location.pathname.includes('/register.html') || window.location.pathname.includes('forgot-password.html');

    if (!token && !isAuthPage) {
        window.location.href = '/login.html';
    } else if (token && isAuthPage) {
        window.location.href = '/index.html';
    }
}

// Wrapper for fetch to include JWT token
async function fetchWithAuth(url, options = {}) {
    const token = getToken();
    if (!options.headers) {
        options.headers = {};
    }
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, options);
    if (response.status === 401) {
        // Token expired or invalid
        removeToken();
        window.location.href = '/login.html';
        throw new Error("Unauthorized");
    }
    return response;
}

// --- GOOGLE OAUTH ---
let GOOGLE_CLIENT_ID = null;

async function handleGoogleCallback(response) {
    if (!response.credential) return;

    const isRegisterPage = window.location.pathname.includes('register.html');

    try {
        const res = await fetch(`${API_BASE_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: response.credential,
                is_register: isRegisterPage
            })
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || "Google Login failed");
        }

        const data = await res.json();
        setToken(data.access_token);

        if (isRegisterPage) {
            window.location.href = '/onboarding.html';
        } else {
            window.location.href = '/index.html';
        }
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function initGoogleAuth() {
    if (typeof google === 'undefined') return;

    if (!GOOGLE_CLIENT_ID) {
        try {
            const res = await fetch(`${API_BASE_URL}/auth/google-client-id`);
            const data = await res.json();
            if (data.client_id) {
                GOOGLE_CLIENT_ID = data.client_id;
            } else {
                console.warn("Google Client ID not configured.");
                return;
            }
        } catch (err) {
            console.error("Failed to fetch Google Client ID", err);
            return;
        }
    }

    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCallback
    });

    const signInBtn = document.getElementById('googleSignInBtn');
    if (signInBtn) {
        google.accounts.id.renderButton(signInBtn, { theme: 'outline', size: 'large' });
    }

    const signUpBtn = document.getElementById('googleSignUpBtn');
    if (signUpBtn) {
        google.accounts.id.renderButton(signUpBtn, { theme: 'outline', size: 'large' });
    }
}

window.onload = function () {
    if (typeof google !== 'undefined') {
        initGoogleAuth();
    } else {
        // Fallback polling if script takes too long
        const interval = setInterval(() => {
            if (typeof google !== 'undefined') {
                clearInterval(interval);
                initGoogleAuth();
            }
        }, 300);
    }
};

async function loadDashboard() {
    try {
        const userRes = await fetchWithAuth(`${API_BASE_URL}/users/me`);
        const user = await userRes.json();
        $('#dashName').text(user.name.split(' ')[0]);

        const profileRes = await fetchWithAuth(`${API_BASE_URL}/profile/`);
        const profile = await profileRes.json();
        const goalCals = profile.daily_calorie_goal || 2000;
        $('#goalCals').text(goalCals.toLocaleString());

        let dateFilterVal = $('#recentMealsDateFilter').val();

        const todayD = new Date();
        if (!dateFilterVal) {
            // Default to today in YYYY-MM-DD
            dateFilterVal = todayD.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
            $('#recentMealsDateFilter').val(dateFilterVal);
        }

        $('#recentMealsDateFilter').attr('max', todayD.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }));

        const logsRes = await fetchWithAuth(`${API_BASE_URL}/logs/?date=${dateFilterVal}`);
        const logs = await logsRes.json();

        let eatenCals = 0;
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFat = 0;
        let totalVitC = 0;
        let totalCalcium = 0;
        let totalIron = 0;

        // Calculate today's totals (Philippine Time)
        const todayStr = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Manila' });

        const recentContainer = $('#recentMealsContainer');
        recentContainer.empty();

        const groupedLogs = {};

        logs.forEach((log) => {
            const logDate = new Date(log.logged_at);
            const logDateStr = logDate.toLocaleDateString('en-US', { timeZone: 'Asia/Manila' });

            eatenCals += log.calories;
            totalProtein += log.protein_g;
            totalCarbs += log.carbs_g;
            totalFat += log.fat_g;
            totalVitC += (log.vitamin_c_mg || 0);
            totalCalcium += (log.calcium_mg || 0);
            totalIron += (log.iron_mg || 0);

            // Raw string 'YYYY-MM-DD' for grouping and sorting
            const sortKey = logDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
            let displayDate = logDateStr === todayStr ? "Today" :
                logDate.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

            if (!groupedLogs[sortKey]) {
                groupedLogs[sortKey] = {
                    displayDate: displayDate,
                    logs: []
                };
            }
            groupedLogs[sortKey].logs.push(log);
        });

        // Sort descending
        const sortedKeys = Object.keys(groupedLogs).sort().reverse();

        sortedKeys.forEach(key => {
            const group = groupedLogs[key];

            // Render Date Header
            recentContainer.append(`<div class="badge bg-light text-secondary w-100 text-start py-2 px-3 fw-bold border-bottom" style="font-size: 0.85rem; border-radius:0;">${group.displayDate}</div>`);

            group.logs.forEach(log => {
                const logDate = new Date(log.logged_at);
                const timeString = logDate.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });

                let mealEmoji = '🍽️';
                if (log.meal_type.toLowerCase() === 'snack') mealEmoji = '🥨';
                if (log.food_name === 'Error Processing') mealEmoji = '❌';

                const html = `
                        <div class="list-group-item border-0 py-3 d-flex align-items-center justify-content-between meal-item" style="cursor: pointer;" data-log-id="${log.id}">
                            <div class="d-flex align-items-center flex-grow-1" style="min-width: 0;">
                                <div class="meal-icon bg-light-subtle rounded d-flex align-items-center justify-content-center me-3 fs-3" style="width:50px; height:50px; flex-shrink: 0;">
                                    ${mealEmoji}
                                </div>
                                <div style="min-width: 0;">
                                    <h6 class="mb-0 fw-bold text-truncate" style="max-width: 150px;">${log.food_name}</h6>
                                    <small class="text-muted">${log.meal_type} • ${timeString}</small>
                                </div>
                            </div>
                            <span class="fw-bold text-success text-end text-nowrap" style="min-width: 80px; flex-shrink: 0;">${log.calories} kcal</span>
                        </div>
                    `;
                const $el = $(html);

                $el.click(() => {
                    $('#modalFoodName').text(log.food_name);
                    $('#modalCals').text(log.calories);
                    $('#modalProtein').text(log.protein_g);
                    $('#modalCarbs').text(log.carbs_g);
                    $('#modalFat').text(log.fat_g);
                    $('#modalVitC').text(log.vitamin_c_mg || 0);
                    $('#modalCalcium').text(log.calcium_mg || 0);
                    $('#modalIron').text(log.iron_mg || 0);

                    if (log.image_url) {
                        const imgSrc = log.image_url.startsWith('http') ? log.image_url : API_BASE_URL + log.image_url;
                        $('#modalFoodImage').attr('src', imgSrc);
                        $('#modalImageContainer').removeClass('d-none');
                    } else {
                        $('#modalImageContainer').addClass('d-none');
                        $('#modalFoodImage').attr('src', '');
                    }

                    if (log.medical_caution) {
                        $('#modalMedicalCautionAlert').removeClass('d-none').find('#modalCautionText').text(log.medical_caution);
                    } else {
                        $('#modalMedicalCautionAlert').addClass('d-none');
                    }

                    const modal = new bootstrap.Modal(document.getElementById('mealDetailModal'));
                    modal.show();
                });

                recentContainer.append($el);
            });
        });

        $('#eatenCals').text(eatenCals.toLocaleString());
        $('#remainingCals').text(Math.max(0, goalCals - eatenCals).toLocaleString());
        $('#dashCarbs').text(Math.round(totalCarbs));
        $('#dashProtein').text(Math.round(totalProtein));
        $('#dashFat').text(Math.round(totalFat));

        // Progress bars for macros
        $('#carbsBar').css('flex', totalCarbs);
        $('#proteinBar').css('flex', totalProtein);
        $('#fatBar').css('flex', totalFat);

        // Micronutrient progress
        const vitCFmt = (Math.round(totalVitC * 10) / 10).toFixed(1);
        const calcFmt = (Math.round(totalCalcium * 10) / 10).toFixed(1);
        const ironFmt = (Math.round(totalIron * 10) / 10).toFixed(1);

        $('#dashVitC').text(vitCFmt);
        $('#vitCBar').css('width', `${Math.min(100, (totalVitC / 90) * 100)}%`);

        $('#dashCalcium').text(calcFmt);
        $('#calciumBar').css('width', `${Math.min(100, (totalCalcium / 90) * 100)}%`);

        $('#dashIron').text(ironFmt);
        $('#ironBar').css('width', `${Math.min(100, (totalIron / 90) * 100)}%`);

        // Dynamic Status Badge
        const percentage = (eatenCals / goalCals) * 100;
        const statusBadge = $('#dailyStatusBadge');
        statusBadge.removeClass('bg-secondary-subtle text-secondary bg-warning-subtle text-warning bg-info-subtle text-info bg-success-subtle text-success bg-primary-subtle text-primary bg-danger-subtle text-danger');

        if (eatenCals === 0) {
            statusBadge.text('No Meals Yet').addClass('bg-secondary-subtle text-secondary');
            $('#recentMealsContainer').append(`<p class="text-muted text-center py-4">No food logs found.</p>`);
            $('#carbsBar').css('flex', '0 0 0');
            $('#proteinBar').css('flex', '0 0 0');
            $('#fatBar').css('flex', '0 0 0');
        } else if (percentage < 40) {
            statusBadge.text('Fuel Up! 🔥').addClass('bg-warning-subtle text-warning');
        } else if (percentage < 60) {
            statusBadge.text('Eating Light 🥗').addClass('bg-info-subtle text-info');
        } else if (percentage < 90) {
            statusBadge.text('On Track ✅').addClass('bg-success-subtle text-success');
        } else if (percentage <= 100) {
            statusBadge.text('Almost There 🎯').addClass('bg-primary-subtle text-primary');
        } else {
            statusBadge.text('Over Limit ⚠️').addClass('bg-danger-subtle text-danger');
        }

    } catch (err) {
        console.error("Dashboard Load Error", err);
    }
}

// --- NOTIFICATIONS ---
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function configurePushSubscription() {
    if (!('serviceWorker' in navigator)) return;
    if (!('PushManager' in window)) return;

    try {
        const reg = await navigator.serviceWorker.ready;

        // 1. Get public VAPID key from backend
        const keyRes = await fetchWithAuth(`${API_BASE_URL}/push/public-key`);
        if (!keyRes.ok) {
            console.error("Failed to fetch push public key");
            return;
        }
        const { public_key } = await keyRes.json();

        // 2. Check permission first
        if (Notification.permission !== 'granted') {
            return;
        }

        const subscribeOptions = {
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(public_key)
        };

        const subscription = await reg.pushManager.subscribe(subscribeOptions);

        // Extract subscription keys
        const subJSON = subscription.toJSON();
        const subData = {
            endpoint: subJSON.endpoint,
            p256dh: subJSON.keys.p256dh,
            auth: subJSON.keys.auth
        };

        // 3. Send subscription details to backend
        const saveRes = await fetchWithAuth(`${API_BASE_URL}/push/subscribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(subData)
        });

        if (saveRes.ok) {
            console.log("Web Push subscription saved to backend successfully.");
        } else {
            console.error("Failed to save Web Push subscription to backend.");
        }
    } catch (err) {
        console.error("Error setting up Web Push subscription:", err);
    }
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                await configurePushSubscription();
            }
        } catch (e) { console.error(e); }
    } else if (Notification.permission === 'granted') {
        await configurePushSubscription();
    }
}

async function showLocalNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    // Prefer service worker showNotification for better mobile PWA support
    try {
        const reg = await navigator.serviceWorker.ready;

        return reg.showNotification(title, {
            body,
            badge: '/favicon.ico'
        });
    } catch (e) {
        new Notification(title, { body });
    }
}

function setupMealNotifications(reminders) {
    if (!('Notification' in window)) return;

    const now = new Date();

    Object.keys(reminders).forEach(meal => {
        const timeStr = reminders[meal];
        if (!timeStr) return;

        // Parse "hh:mm AM" to today's Date object
        const match = timeStr.match(/(\d+):(\d+)\s(.*)/i);
        if (!match) return;

        let [_, hours, mins, modifier] = match;
        hours = parseInt(hours, 10);
        mins = parseInt(mins, 10);

        if (modifier.toUpperCase() === 'PM' && hours < 12) hours += 12;
        if (modifier.toUpperCase() === 'AM' && hours === 12) hours = 0;

        const targetTime = new Date();
        targetTime.setHours(hours, mins, 0, 0);

        const diffMs = targetTime.getTime() - now.getTime();

        // 1 hour before (in ms)
        const ms1Hr = diffMs - (60 * 60 * 1000);
        // 30 mins before (in ms)
        const ms30Min = diffMs - (30 * 60 * 1000);

        // Schedule if it's still in the future
        if (ms1Hr > 0) {
            setTimeout(() => {
                showLocalNotification('NutriAI Meal Reminder 🍽️', `Your ${meal} is in 1 hour! Time to prepare.`);
            }, ms1Hr);
        }

        if (ms30Min > 0) {
            setTimeout(() => {
                showLocalNotification('NutriAI Meal Reminder ⏳', `Your ${meal} is in 30 minutes!`);
            }, ms30Min);
        }
    });
}

async function loadReminders() {
    try {
        const res = await fetchWithAuth(`${API_BASE_URL}/ai/reminders`);
        const data = await res.json();

        if (data) {
            if (data.Breakfast) $('#remindBreakfast').text(data.Breakfast);
            if (data.Lunch) $('#remindLunch').text(data.Lunch);
            if (data.Dinner) $('#remindDinner').text(data.Dinner);

            // Setup notifications if permission is granted
            if (Notification.permission === 'granted') {
                configurePushSubscription();
                setupMealNotifications(data);
            }
        }
    } catch (err) {
        console.error("Failed to load smart reminders", err);
    }
}

$(document).ready(function () {
    console.log("NutriAI initialized");

    // Initialize password strength validations
    setupPasswordStrengthValidation('#regPassword');
    setupPasswordStrengthValidation('#newPassword');
    setupPasswordStrengthValidation('#forgotNewPassword');

    // Populate conditions if on onboarding page
    if (window.location.pathname.includes('onboarding.html')) {
        populateMedicalConditions('#illnessesOptionsContainer', '#selectedIllnessesText', '');
    }

    // Check auth state on load
    checkAuth();

    if (window.location.pathname.includes('/index.html') || window.location.pathname === '/') {
        loadDashboard();

        // Request notifications (usually better on user interact, but we ask here)
        requestNotificationPermission().then(() => {
            loadReminders();
        });

        $('#recentMealsDateFilter').on('change', function () {
            loadDashboard(); // Re-render with new filter value
        });
    }

    // --- AUTH LOGIC ---
    $('#loginForm').submit(async function (e) {
        e.preventDefault();
        const email = $('#loginEmail').val();
        const password = $('#loginPassword').val();

        const btn = $('#loginBtn');
        btn.prop('disabled', true).text('Logging in...');
        $('#loginError').addClass('d-none');

        const formData = new URLSearchParams();
        formData.append('username', email); // OAuth2 requires 'username'
        formData.append('password', password);

        try {
            const res = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData
            });

            if (!res.ok) {
                throw new Error("Invalid credentials");
            }

            const data = await res.json();
            setToken(data.access_token);
            window.location.href = '/index.html';
        } catch (err) {
            showToast(err.message, 'danger');
            btn.prop('disabled', false).text('Login');
        }
    });

    $('#registerForm').submit(async function (e) {
        e.preventDefault();
        const first_name = $('#regFirstName').val();
        const last_name = $('#regLastName').val();
        const middle_initial = $('#regMiddleInitial').val() || null;
        const email = $('#regEmail').val();
        const password = $('#regPassword').val();

        if (!isStrongPassword(password)) {
            showToast("Please use a strong password that meets all requirements.", 'danger');
            return;
        }

        const btn = $('#regBtn');
        btn.prop('disabled', true).text('Creating Account...');
        $('#regError').addClass('d-none');

        try {
            const res = await fetch(`${API_BASE_URL}/users/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, first_name, last_name, middle_initial })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Registration failed");
            }

            // Auto login after register
            const formData = new URLSearchParams();
            formData.append('username', email);
            formData.append('password', password);
            const loginRes = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData
            });
            const data = await loginRes.json();
            setToken(data.access_token);

            // Redirect to Onboarding
            window.location.href = 'onboarding.html';
        } catch (err) {
            showToast(err.message, 'danger');
            btn.prop('disabled', false).text('Create Account');
        }
    });

    $('#logoutBtn, #logoutBtnHeader').click(function (e) {
        e.preventDefault();
        removeToken();
        window.location.href = '/login.html';
    });

    // --- NAVIGATION ---
    $('#profileNav').click(function () {
        window.location.href = "profile.html";
    });

    // --- PROFILE / ONBOARDING LOGIC ---
    $('#onboardingForm').submit(async function (e) {
        e.preventDefault();

        const illnessesList = [];
        $('#illnessesOptionsContainer .condition-checkbox:checked').each(function () {
            illnessesList.push($(this).val());
        });

        const profileData = {
            height_cm: parseFloat($('#height_cm').val()),
            weight_kg: parseFloat($('#weight_kg').val()),
            target_weight_kg: parseFloat($('#target_weight_kg').val()),
            illnesses: illnessesList.join(', '),
            allergies: $('#allergies').val()
        };

        const btn = $('#saveProfileBtn');
        const isUpdate = !!$('#isUpdate').val(); // Flag to know if we are on profile.html or onboarding.html
        btn.prop('disabled', true).text('Saving...');

        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/profile/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileData)
            });

            if (!res.ok) throw new Error("Failed to save profile");
            const data = await res.json();

            // Also log to weight history
            await fetchWithAuth(`${API_BASE_URL}/weight/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ weight_kg: profileData.weight_kg })
            });

            showToast(`Profile Saved! Your daily calorie target is ${data.daily_calorie_goal} kcal.`);
            setTimeout(() => {
                if (isUpdate) {
                    window.location.href = "profile.html";
                } else {
                    window.location.href = "/index.html";
                }
            }, 2000);
        } catch (err) {
            console.error(err);
            showToast("Failed to save profile.", "danger");
            btn.prop('disabled', false).text(isUpdate ? 'Update Profile' : 'Save Profile & Continue');
        }
    });

    // Load Profile Data if on Profile page or sub-pages
    if (window.location.pathname.includes('profile')) {
        // 1. Load User Basic Info
        fetchWithAuth(`${API_BASE_URL}/users/me`)
            .then(res => res.json())
            .then(data => {
                // Populate settings menu details
                if ($('#profileMenuContainer').length > 0) {
                    const fullName = `${data.first_name || ''} ${data.middle_initial ? data.middle_initial + '. ' : ''}${data.last_name || ''}`.trim() || 'User Profile';
                    $('#profileFullNameDisplay').text(fullName);
                    $('#profileEmailDisplay').text(data.email || '');

                    const initials = ((data.first_name ? data.first_name[0] : '') + (data.last_name ? data.last_name[0] : '')).toUpperCase() || 'U';
                    $('#profileAvatarInitials').text(initials);
                }

                // Populate basic info form
                if ($('#profileInfoForm').length > 0) {
                    $('#profileFirstName').val(data.first_name || '');
                    $('#profileLastName').val(data.last_name || '');
                    $('#profileMiddleInitial').val(data.middle_initial || '');
                    $('#profileEmail').val(data.email);
                }
            }).catch(err => console.log("User info error", err));

        // 2. Load User Profile Metrics Info
        fetchWithAuth(`${API_BASE_URL}/profile/`)
            .then(res => res.json())
            .then(data => {
                // Populate metrics details
                if ($('#onboardingForm').length > 0) {
                    $('#height_cm').val(data.height_cm);
                    $('#weight_kg').val(data.weight_kg);
                    $('#target_weight_kg').val(data.target_weight_kg);
                    populateMedicalConditions('#illnessesOptionsContainer', '#selectedIllnessesText', data.illnesses);
                    $('#allergies').val(data.allergies);
                }
            }).catch(err => {
                console.log("Profile not found or error", err);
                if ($('#onboardingForm').length > 0) {
                    populateMedicalConditions('#illnessesOptionsContainer', '#selectedIllnessesText', '');
                }
            });

        // Handle Basic Info Update
        if ($('#profileInfoForm').length > 0) {
            $('#profileInfoForm').submit(async function (e) {
                e.preventDefault();
                const btn = $('#saveBasicInfoBtn');
                btn.prop('disabled', true).text('Saving...');

                try {
                    const res = await fetchWithAuth(`${API_BASE_URL}/users/me/update`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            first_name: $('#profileFirstName').val(),
                            last_name: $('#profileLastName').val(),
                            middle_initial: $('#profileMiddleInitial').val() || null,
                            email: $('#profileEmail').val()
                        })
                    });

                    if (!res.ok) {
                        const errInfo = await res.json();
                        throw new Error(errInfo.detail || "Failed to save info");
                    }
                    showToast("Basic Information updated successfully!");
                } catch (err) {
                    showToast(err.message, 'danger');
                } finally {
                    btn.prop('disabled', false).text('Save Basic Info');
                }
            });
        }

        // Handle Password Update
        if ($('#changePasswordForm').length > 0) {
            $('#changePasswordForm').submit(async function (e) {
                e.preventDefault();
                const currentPw = $('#currentPassword').val();
                const newPw = $('#newPassword').val();
                const confirmPw = $('#confirmNewPassword').val();

                if (newPw !== confirmPw) {
                    showToast("New passwords do not match!", 'danger');
                    return;
                }

                if (!isStrongPassword(newPw)) {
                    showToast("Please use a strong password that meets all requirements.", 'danger');
                    return;
                }

                const btn = $('#changePasswordBtn');
                btn.prop('disabled', true).text('Updating...');

                try {
                    const res = await fetchWithAuth(`${API_BASE_URL}/users/me/password`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            current_password: currentPw,
                            new_password: newPw
                        })
                    });

                    if (!res.ok) {
                        const errInfo = await res.json();
                        throw new Error(errInfo.detail || "Failed to update password");
                    }

                    showToast("Password updated successfully!");
                    $('#changePasswordForm')[0].reset();
                } catch (err) {
                    showToast(err.message, 'danger');
                } finally {
                    btn.prop('disabled', false).text('Change Password');
                }
            });
        }

        // Handle Profile Deletion (only runs on profile.html menu page)
        if ($('#confirmDeleteProfileBtn').length > 0) {
            $('#confirmDeleteProfileBtn').click(async function () {
                const btn = $(this);
                const originalText = btn.text();
                btn.prop('disabled', true).text('Deleting...');

                try {
                    const res = await fetchWithAuth(`${API_BASE_URL}/users/me`, {
                        method: 'DELETE',
                    });

                    if (!res.ok) {
                        const errInfo = await res.json();
                        throw new Error(errInfo.detail || "Failed to delete account");
                    }

                    // Clean up and redirect to login
                    removeToken();
                    window.location.href = '/login.html';
                } catch (err) {
                    showToast(err.message, 'danger');
                    btn.prop('disabled', false).text(originalText);
                }
            });
        }
    }


    // --- PROGRESS LOGIC (Chart.js) ---
    if (window.location.pathname.includes('progress.html')) {
        let weightChart = null;

        async function loadWeightData() {
            try {
                const res = await fetchWithAuth(`${API_BASE_URL}/weight/`);
                const data = await res.json();

                const labels = data.map(d => new Date(d.logged_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
                const weights = data.map(d => d.weight_kg);

                const ctx = document.getElementById('weightChart').getContext('2d');
                if (weightChart) weightChart.destroy();

                weightChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Weight (kg)',
                            data: weights,
                            borderColor: '#198754', // success color
                            backgroundColor: 'rgba(25, 135, 84, 0.1)',
                            borderWidth: 3,
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { beginAtZero: false }
                        }
                    }
                });
            } catch (err) {
                console.log("Error loading weight data", err);
            }
        }

        loadWeightData();

        async function loadFoodLogHistory() {
            try {
                const logsRes = await fetchWithAuth(`${API_BASE_URL}/logs/`);
                const logs = await logsRes.json();

                const profileRes = await fetchWithAuth(`${API_BASE_URL}/profile/`);
                const profile = await profileRes.json();
                const goalCals = profile.daily_calorie_goal || 2000;

                const historyContainer = $('#foodLogHistory');
                historyContainer.empty();

                if (logs.length === 0) {
                    historyContainer.html('<p class="text-muted text-center py-4">No food logs found.</p>');
                    return;
                }

                // Group by date (Manila timezone)
                const groupedLogs = {};
                logs.forEach(log => {
                    const d = new Date(log.logged_at);
                    const dateStr = d.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                    // Raw string 'YYYY-MM-DD' for sorting
                    const sortKey = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

                    if (!groupedLogs[sortKey]) {
                        groupedLogs[sortKey] = {
                            displayDate: dateStr,
                            eatenCals: 0,
                            carbs: 0,
                            protein: 0,
                            fat: 0,
                            vitC: 0,
                            calcium: 0,
                            iron: 0
                        };
                    }
                    groupedLogs[sortKey].eatenCals += log.calories;
                    groupedLogs[sortKey].carbs += log.carbs_g;
                    groupedLogs[sortKey].protein += log.protein_g;
                    groupedLogs[sortKey].fat += log.fat_g;
                    groupedLogs[sortKey].vitC += (log.vitamin_c_mg || 0);
                    groupedLogs[sortKey].calcium += (log.calcium_mg || 0);
                    groupedLogs[sortKey].iron += (log.iron_mg || 0);
                });

                // Sort descending
                const sortedKeys = Object.keys(groupedLogs).sort().reverse();

                sortedKeys.forEach(key => {
                    const data = groupedLogs[key];
                    const remaining = Math.max(0, goalCals - data.eatenCals);

                    // Micronutrient formatting and logic
                    const vitCFmt = (Math.round(data.vitC * 10) / 10).toFixed(1);
                    const calcFmt = (Math.round(data.calcium * 10) / 10).toFixed(1);
                    const ironFmt = (Math.round(data.iron * 10) / 10).toFixed(1);

                    const vitCPct = Math.min(100, (data.vitC / 90) * 100);
                    const calcPct = Math.min(100, (data.calcium / 90) * 100);
                    const ironPct = Math.min(100, (data.iron / 90) * 100);

                    let statusText = "On Track";
                    let statusClass = "text-success bg-success-subtle";
                    const pct = (data.eatenCals / goalCals) * 100;
                    if (pct > 100) {
                        statusText = "Over Limit";
                        statusClass = "text-danger bg-danger-subtle";
                    } else if (pct < 40) {
                        statusText = "Increase your intake";
                        statusClass = "text-warning bg-warning-subtle";
                    }

                    const card = `
                        <div class="card history-card border-0 shadow-sm mb-3">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <h6 class="fw-bold m-0 text-dark">${data.displayDate}</h6>
                                    <span class="badge ${statusClass} rounded-pill px-3 py-2">${statusText}</span>
                                </div>
                                <div class="row text-center mb-3">
                                    <div class="col-4 border-end">
                                        <small class="text-muted d-block">Eaten</small>
                                        <span class="fw-bold fs-6 text-dark">${data.eatenCals.toLocaleString()}</span>
                                    </div>
                                    <div class="col-4 border-end">
                                        <small class="text-muted d-block">Goal</small>
                                        <span class="fw-bold fs-6 text-dark">${goalCals.toLocaleString()}</span>
                                    </div>
                                    <div class="col-4">
                                        <small class="text-muted d-block">Rem.</small>
                                        <span class="fw-bold fs-6 text-success">${remaining.toLocaleString()}</span>
                                    </div>
                                </div>
                                <div class="progress" style="height: 6px;">
                                    <div class="progress-bar bg-info" style="flex: ${Math.round(data.carbs)}"></div>
                                    <div class="progress-bar bg-warning" style="flex: ${Math.round(data.protein)}"></div>
                                    <div class="progress-bar bg-danger" style="flex: ${Math.round(data.fat)}"></div>
                                </div>
                                <div class="d-flex justify-content-between text-muted small mt-1" style="font-size: 0.7rem;">
                                    <span>Carbs: ${Math.round(data.carbs)}g</span>
                                    <span>Prot: ${Math.round(data.protein)}g</span>
                                    <span>Fat: ${Math.round(data.fat)}g</span>
                                </div>
                                <hr class="my-3 opacity-25">
                                <div class="row text-center mt-3 g-2">
                                    <div class="col-4">
                                        <div class="d-flex flex-column align-items-center">
                                            <div class="d-flex justify-content-between w-100 mb-1" style="font-size: 0.65rem;">
                                                <span class="text-muted">Vit C</span>
                                                <span class="fw-bold text-dark">${vitCFmt} mg</span>
                                            </div>
                                            <div class="progress w-100" style="height: 4px;">
                                                <div class="progress-bar bg-success" style="width: ${vitCPct}%"></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-4">
                                        <div class="d-flex flex-column align-items-center">
                                            <div class="d-flex justify-content-between w-100 mb-1" style="font-size: 0.65rem;">
                                                <span class="text-muted">Calcium</span>
                                                <span class="fw-bold text-dark">${calcFmt} mg</span>
                                            </div>
                                            <div class="progress w-100" style="height: 4px;">
                                                <div class="progress-bar bg-primary" style="width: ${calcPct}%"></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-4">
                                        <div class="d-flex flex-column align-items-center">
                                            <div class="d-flex justify-content-between w-100 mb-1" style="font-size: 0.65rem;">
                                                <span class="text-muted">Iron</span>
                                                <span class="fw-bold text-dark">${ironFmt} mg</span>
                                            </div>
                                            <div class="progress w-100" style="height: 4px;">
                                                <div class="progress-bar bg-danger" style="width: ${ironPct}%"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                    historyContainer.append(card);
                });

            } catch (err) {
                console.error("Failed to load food log history", err);
                $('#foodLogHistory').html('<p class="text-danger small text-center">Failed to load logs.</p>');
            }
        }

        loadFoodLogHistory();

        $('#weightLogForm').submit(async function (e) {
            e.preventDefault();
            const weight = parseFloat($('#newWeightInput').val());
            const btn = $(this).find('button');
            btn.prop('disabled', true).text('...');

            try {
                await fetchWithAuth(`${API_BASE_URL}/weight/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ weight_kg: weight })
                });
                $('#newWeightInput').val('');
                await loadWeightData();
            } catch (err) {
                showToast("Failed to save weight", "danger");
            } finally {
                btn.prop('disabled', false).text('Save');
            }
        });
    }

    // --- SCANNER LOGIC (WebRTC) ---
    let selectedImageFile = null;
    let localStream = null;
    let latestAnalysisResult = null;

    if (window.location.pathname.includes('scanner.html')) {
        const video = document.getElementById('cameraStream');
        const canvas = document.getElementById('cameraCanvas');
        const captureBtn = document.getElementById('captureBtn');
        const retakeBtn = document.getElementById('retakeBtn');
        const imagePreview = document.getElementById('imagePreview');

        // Start WebRTC Camera
        async function startCamera() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showToast("Camera access restricted. Fallback mode active.", "warning");
                $('#cameraFallbackOverlay').removeClass('d-none').addClass('d-flex');
                $('#cameraFrame').addClass('d-none');
                $('#captureBtn').addClass('d-none');
                return;
            }
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } },
                    audio: false
                });
                video.srcObject = stream;
                localStream = stream;

                // Slight delay to ensure video dimensions before Quagga starts
                video.onloadedmetadata = function () {
                    startContinuousBarcodeScan();
                };
            } catch (err) {
                console.error("Camera access denied or unavailable", err);
                showToast("Could not access camera. Try fallback upload.", "warning");
                $('#cameraFallbackOverlay').removeClass('d-none').addClass('d-flex');
                $('#cameraFrame').addClass('d-none');
                $('#captureBtn').addClass('d-none');
            }
        }

        startCamera();

        // Fallback file input change handler
        $('#fallbackCameraInput').on('change', function (e) {
            const file = e.target.files[0];
            if (!file) return;

            selectedImageFile = file;
            const reader = new FileReader();
            reader.onload = function (event) {
                const dataUrl = event.target.result;
                imagePreview.src = dataUrl;
                $(imagePreview).show();
                $('#retakeBtn').removeClass('d-none');

                $('#uploadInputContainer').addClass('d-none');
                $('#textInputContainer').addClass('d-none');

                Quagga.decodeSingle({
                    src: dataUrl,
                    numOfWorkers: 0,
                    decoder: { readers: ["ean_reader", "upc_reader", "ean_8_reader", "upc_e_reader"] }
                }, function (result) {
                    if (result && result.codeResult) {
                        handleBarcodeResult(result.codeResult.code);
                    }
                });
            };
            reader.readAsDataURL(file);
        });

        // --- VOICE INPUT ---
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const isIOSPWA = window.navigator.standalone === true;

        if (SpeechRecognition && !isIOSPWA) {
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            // Explicitly set language, helps prevent mobile browser aborts
            recognition.lang = window.navigator.language || 'en-US';

            let isListening = false;
            $('#voiceInputBtn').on('click', function (e) {
                e.preventDefault();
                if (isListening) {
                    try { recognition.stop(); } catch (err) {
                        console.error(err);
                    }
                } else {
                    $(this).addClass('listening');
                    $('#voiceStatus').removeClass('d-none');
                    isListening = true;

                    // On many mobile devices, an active video stream will lock the media session
                    // and cause SpeechRecognition to immediately abort. Pause it temporarily.
                    if (video && !video.paused) {
                        video.pause();
                    }

                    try {
                        recognition.start();
                    } catch (err) {
                        isListening = false;
                        $(this).removeClass('listening');
                        $('#voiceStatus').addClass('d-none');
                        if (video && video.paused) video.play();
                        showToast(`Voice start error: ${err.message}. If on mobile, ensure HTTPS.`, 'danger');
                    }
                }
            });

            recognition.onend = function () {
                isListening = false;
                $('#voiceInputBtn').removeClass('listening');
                $('#voiceStatus').addClass('d-none');

                // Resume camera stream if it was playing
                if (video && video.paused && localStream) {
                    video.play();
                }
            };

            recognition.onresult = function (event) {
                const transcript = event.results[0][0].transcript;
                $('#foodText').val(transcript);
            };

            recognition.onerror = function (event) {
                // Ignore silent intentional aborts to prevent spamming toasts
                if (event.error === 'aborted' && !isListening) {
                    return;
                }

                isListening = false;
                console.error("Speech recognition error:", event.error);
                $('#voiceInputBtn').removeClass('listening');
                $('#voiceStatus').addClass('d-none');

                if (video && video.paused && localStream) {
                    video.play();
                }

                let errorMsg = event.error;
                if (event.error === 'not-allowed') {
                    errorMsg = "Microphone access denied. Check permissions or ensure HTTPS.";
                } else if (event.error === 'network') {
                    errorMsg = "Network error occurred for speech recognition.";
                } else if (event.error === 'aborted') {
                    errorMsg = "Microphone was aborted. This can happen if another app is using the mic, or the browser interrupted it.";
                }
                showToast(`Mic error: ${errorMsg}`, "danger");
            };
        } else {
            $('#voiceInputBtn').hide();
            if (isIOSPWA) {
                console.warn("Speech recognition is disabled on iOS PWA mode due to Apple restrictions.");
            }
        }

        // --- BARCODE SCANNING (QuaggaJS) ---
        let scanningBarcode = false;
        let barcodePauseTimer = null;

        function handleBarcodeResult(code) {
            showToast(`Barcode ${code} detected. Fetching data...`, "info");

            if (scanningBarcode) {
                Quagga.stop();
                scanningBarcode = false;
            }
            if (barcodePauseTimer) clearTimeout(barcodePauseTimer);

            // Fetch from Open Food Facts API
            fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`)
                .then(res => res.json())
                .then(data => {
                    if (data.status === 1 && data.product) {
                        const name = data.product.product_name || "Unknown Product";
                        let infoStr = `Barcode: ${name}`;
                        if (data.product.nutriments && data.product.nutriments['energy-kcal_100g']) {
                            infoStr += `, ${data.product.nutriments['energy-kcal_100g']} kcal/100g`;
                        }
                        $('#foodText').val(infoStr);
                        $('#barcodeResult').removeClass('d-none').text(`Found: ${name}`);
                    } else {
                        $('#barcodeResult').removeClass('d-none').text(`Product not found for barcode ${code}.`);
                        if (!$('#foodText').val()) $('#foodText').val(`Scanned barcode: ${code}`);
                    }
                })
                .catch(err => {
                    console.error("Barcode API error", err);
                    if (!$('#foodText').val()) $('#foodText').val(`Scanned barcode: ${code}`);
                });

            barcodePauseTimer = setTimeout(() => {
                $('#barcodeResult').addClass('d-none');
                if (localStream && !selectedImageFile) startContinuousBarcodeScan();
            }, 5000);
        }

        function startContinuousBarcodeScan() {
            if (!localStream) return;
            $('#cameraFrame').css('border-color', '#0dcaf0'); // Info color to indicate scanning active

            Quagga.init({
                inputStream: {
                    name: "Live",
                    type: "LiveStream",
                    target: video,
                    constraints: { facingMode: "environment" }
                },
                locator: {
                    patchSize: "medium",
                    halfSample: true
                },
                decoder: { readers: ["ean_reader", "upc_reader", "ean_8_reader", "upc_e_reader"] }
            }, function (err) {
                if (err) return;
                scanningBarcode = true;
                Quagga.start();
            });

            Quagga.onDetected(function (result) {
                if (!result || !result.codeResult) return;
                const code = result.codeResult.code;
                handleBarcodeResult(code);
            });
        }

        $(captureBtn).click(function () {
            if (!localStream) return;
            // Draw video frame to canvas
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Get data URL
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            imagePreview.src = dataUrl;

            // Convert dataUrl to File object for FormData
            fetch(dataUrl)
                .then(res => res.blob())
                .then(blob => {
                    selectedImageFile = new File([blob], "capture.jpg", { type: "image/jpeg" });
                });

            // UI Changes
            $(imagePreview).show();
            $(video).hide();
            $(captureBtn).hide();
            $(retakeBtn).removeClass('d-none');

            $('#uploadInputContainer').addClass('d-none');
            $('#textInputContainer').addClass('d-none');
        });

        function resetScanner() {
            // Stop any existing tracks/camera
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }
            if (scanningBarcode) {
                Quagga.stop();
                scanningBarcode = false;
            }
            if (barcodePauseTimer) clearTimeout(barcodePauseTimer);

            selectedImageFile = null;
            latestAnalysisResult = null;

            // Reset UI inputs
            $('#foodImage').val('');
            $('#fallbackCameraInput').val('');
            $('#foodText').val('');
            $('#barcodeResult').addClass('d-none').text('');
            $(imagePreview).hide();
            $('#retakeBtn').addClass('d-none');

            // Hide results & loading, show form
            $('#scanLoading').addClass('d-none');
            $('#scanResult').addClass('d-none');
            $('#aiScanForm').show();

            // Restore inputs
            $('#uploadInputContainer').removeClass('d-none');
            $('#textInputContainer').removeClass('d-none');

            // Restart Camera
            if (window.location.pathname.includes('scanner.html')) {
                $(video).show();
                $(captureBtn).show();
                startCamera();
            }
        }

        $(retakeBtn).click(resetScanner);
        $('#newRetakeBtn').click(resetScanner);
    }

    // Fallback file input logic
    $('#foodImage').change(function (e) {
        if (e.target.files && e.target.files[0]) {
            selectedImageFile = e.target.files[0];
            const reader = new FileReader();
            reader.onload = function (e) {
                $('#imagePreview').attr('src', e.target.result).show();
                $('#cameraStream').hide();
                $('#captureBtn').hide();
                $('#retakeBtn').removeClass('d-none');

                $('#textInputContainer').addClass('d-none');
            }
            reader.readAsDataURL(e.target.files[0]);
        }
    });

    $('#aiScanForm').submit(async function (e) {
        e.preventDefault();

        const textFood = $('#foodText').val();

        if (!selectedImageFile && !textFood) {
            showToast("Please take a picture or describe your food first.", 'warning');
            return;
        }

        $('#aiScanForm').hide();
        $('#scanLoading').removeClass('d-none');

        // Stop camera stream since we are analyzing
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }

        const formData = new FormData();
        if (selectedImageFile) formData.append('image', selectedImageFile);
        if (textFood) formData.append('food_text', textFood);

        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/ai/analyze-food`, {
                method: 'POST',
                body: formData // DO NOT SET CONTENT TYPE FOR FORMDATA!
            });

            if (!res.ok) throw new Error("Failed to analyze");
            const data = await res.json();

            // Store result in memory to save later
            latestAnalysisResult = data;

            $('#scanLoading').addClass('d-none');
            $('#scanResult').removeClass('d-none');

            // Populate Results included micronutrients
            $('#resFoodName').text(data.food_name);
            $('#resCals').text(data.calories);
            $('#resProtein').text(data.protein_g);
            $('#resCarbs').text(data.carbs_g);
            $('#resFat').text(data.fat_g);
            if ($('#resVitC').length) $('#resVitC').text(data.vitamin_c_mg || 0);
            if ($('#resCalcium').length) $('#resCalcium').text(data.calcium_mg || 0);
            if ($('#resIron').length) $('#resIron').text(data.iron_mg || 0);

            // Handle Medical Caution
            if (data.caution_warning) {
                $('#medicalCautionAlert').removeClass('d-none');
                $('#cautionText').text(data.caution_warning);
            } else {
                $('#medicalCautionAlert').addClass('d-none');
            }

        } catch (err) {
            console.error(err);
            showToast("Failed to analyze food.", 'danger');
            $('#scanLoading').addClass('d-none');
            $('#aiScanForm').show();
            // Restart camera?
            if (window.location.pathname.includes('scanner.html') && !selectedImageFile) {
                startCamera();
            }
        }
    });

    // Save Log Click Handler
    $('#saveLogBtn').click(async function (e) {
        e.preventDefault();
        if (!latestAnalysisResult) return;

        const btn = $(this);
        btn.prop('disabled', true).text('Saving...');

        const mealType = $('#mealType').val() || "Snack";
        const logData = {
            meal_type: mealType,
            food_name: latestAnalysisResult.food_name,
            calories: latestAnalysisResult.calories,
            protein_g: latestAnalysisResult.protein_g,
            carbs_g: latestAnalysisResult.carbs_g,
            fat_g: latestAnalysisResult.fat_g,
            vitamin_c_mg: latestAnalysisResult.vitamin_c_mg || 0,
            calcium_mg: latestAnalysisResult.calcium_mg || 0,
            iron_mg: latestAnalysisResult.iron_mg || 0,
            image_url: latestAnalysisResult.image_url,
            medical_caution: latestAnalysisResult.caution_warning || null
        };

        try {
            const saveRes = await fetchWithAuth(`${API_BASE_URL}/logs/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(logData)
            });
            if (!saveRes.ok) throw new Error("Failed to save log");
            showToast("Food log saved successfully!", "success");

            // Redirect back to dashboard after save
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        } catch (err) {
            console.error(err);
            showToast("Failed to save food log.", "danger");
            btn.prop('disabled', false).text('Save Log');
        }
    });

});
