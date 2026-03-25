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
        if (!dateFilterVal) {
            // Default to today in YYYY-MM-DD
            const todayD = new Date();
            dateFilterVal = todayD.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
            $('#recentMealsDateFilter').val(dateFilterVal);
        }

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

async function loadReminders() {
    try {
        const res = await fetchWithAuth(`${API_BASE_URL}/ai/reminders`);
        const data = await res.json();

        if (data) {
            if (data.Breakfast) $('#remindBreakfast').text(data.Breakfast);
            if (data.Lunch) $('#remindLunch').text(data.Lunch);
            if (data.Dinner) $('#remindDinner').text(data.Dinner);
        }
    } catch (err) {
        console.error("Failed to load smart reminders", err);
    }
}

$(document).ready(function () {
    console.log("NutriAI initialized");

    // Check auth state on load
    checkAuth();

    if (window.location.pathname.includes('/index.html') || window.location.pathname === '/') {
        loadDashboard();
        loadReminders();

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
        const name = $('#regName').val();
        const email = $('#regEmail').val();
        const password = $('#regPassword').val();

        const btn = $('#regBtn');
        btn.prop('disabled', true).text('Creating Account...');
        $('#regError').addClass('d-none');

        try {
            const res = await fetch(`${API_BASE_URL}/users/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, name })
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
        const profileData = {
            height_cm: parseFloat($('#height_cm').val()),
            weight_kg: parseFloat($('#weight_kg').val()),
            target_weight_kg: parseFloat($('#target_weight_kg').val()),
            illnesses: $('#illnesses').val(),
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
                window.location.href = "/index.html";
            }, 2000);
        } catch (err) {
            console.error(err);
            showToast("Failed to save profile.", "danger");
            btn.prop('disabled', false).text(isUpdate ? 'Update Profile' : 'Save Profile & Continue');
        }
    });

    // Load Profile Data if on Profile page
    if (window.location.pathname.includes('profile.html')) {
        fetchWithAuth(`${API_BASE_URL}/profile/`)
            .then(res => res.json())
            .then(data => {
                $('#height_cm').val(data.height_cm);
                $('#weight_kg').val(data.weight_kg);
                $('#target_weight_kg').val(data.target_weight_kg);
                $('#illnesses').val(data.illnesses);
                $('#allergies').val(data.allergies);
            }).catch(err => console.log("Profile not found or error", err));

        // Load User Basic Info
        fetchWithAuth(`${API_BASE_URL}/users/me`)
            .then(res => res.json())
            .then(data => {
                $('#profileName').val(data.name);
                $('#profileEmail').val(data.email);
            }).catch(err => console.log("User info not found or error", err));

        // Handle Basic Info Update
        $('#profileInfoForm').submit(async function (e) {
            e.preventDefault();
            const btn = $('#saveBasicInfoBtn');
            btn.prop('disabled', true).text('Saving...');

            try {
                const res = await fetchWithAuth(`${API_BASE_URL}/users/me/update`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: $('#profileName').val(),
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

        // Handle Password Update
        $('#changePasswordForm').submit(async function (e) {
            e.preventDefault();
            const currentPw = $('#currentPassword').val();
            const newPw = $('#newPassword').val();
            const confirmPw = $('#confirmNewPassword').val();

            if (newPw !== confirmPw) {
                showToast("New passwords do not match!", 'danger');
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

        // Handle Profile Deletion
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
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;

            let isListening = false;
            $('#voiceInputBtn').on('click', function (e) {
                e.preventDefault();
                if (isListening) {
                    try { recognition.stop(); } catch (err) {
                        showToast(`Voice stop error: ${err.message}`, 'danger');
                    }
                } else {
                    $(this).addClass('listening');
                    $('#voiceStatus').removeClass('d-none');
                    isListening = true;
                    try {
                        recognition.start();
                    } catch (err) {
                        isListening = false;
                        $(this).removeClass('listening');
                        $('#voiceStatus').addClass('d-none');
                        showToast(`Voice start error: ${err.message}. If on mobile, ensure HTTPS.`, 'danger');
                    }
                }
            });

            recognition.onend = function () {
                isListening = false;
                $('#voiceInputBtn').removeClass('listening');
                $('#voiceStatus').addClass('d-none');
            };

            recognition.onresult = function (event) {
                const transcript = event.results[0][0].transcript;
                $('#foodText').val(transcript);
            };

            recognition.onerror = function (event) {
                isListening = false;
                console.error("Speech recognition error:", event.error);
                $('#voiceInputBtn').removeClass('listening');
                $('#voiceStatus').addClass('d-none');

                let errorMsg = event.error;
                if (event.error === 'not-allowed') {
                    errorMsg = "Microphone access denied. Check permissions or ensure HTTPS.";
                } else if (event.error === 'network') {
                    errorMsg = "Network error occurred for speech recognition.";
                }
                showToast(`Mic error: ${errorMsg}`, "danger");
            };
        } else {
            $('#voiceInputBtn').hide();
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
        });

        $(retakeBtn).click(function () {
            selectedImageFile = null;
            $(imagePreview).hide();

            if (!localStream) {
                // If it was HTTP fallback
                $('#foodImage').val('');
                $('#fallbackCameraInput').val('');
                $('#cameraFallbackOverlay').removeClass('d-none').addClass('d-flex');
                $('#cameraFrame').addClass('d-none');
                $(captureBtn).addClass('d-none');
            } else {
                $(video).show();
                $(captureBtn).show();
                startContinuousBarcodeScan();
            }
            $(retakeBtn).addClass('d-none');
        });
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

            // Save to DB
            const mealType = $('#mealType').val() || "Snack";
            const logData = {
                meal_type: mealType,
                food_name: data.food_name,
                calories: data.calories,
                protein_g: data.protein_g,
                carbs_g: data.carbs_g,
                fat_g: data.fat_g,
                vitamin_c_mg: data.vitamin_c_mg || 0,
                calcium_mg: data.calcium_mg || 0,
                iron_mg: data.iron_mg || 0,
                image_url: data.image_url, // Ensure URL gets sent to db
                medical_caution: data.caution_warning || null
            };

            await fetchWithAuth(`${API_BASE_URL}/logs/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(logData)
            });

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

});
