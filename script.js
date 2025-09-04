// Data Storage
let teams = [];

let matches = [];

let pendingResults = [];
let resultIdCounter = 1;

// Helper: Normalize and match team names robustly
// This fixes issues where display names differ from stored names (e.g., "andi odanx (admin)" vs "andi_odanx")
function normalizeTeamName(name) {
    if (!name) return '';
    // Remove anything in parentheses, trim, lowercase, remove spaces/underscores and non-alphanumerics
    return name
        .toString()
        .replace(/\([^)]*\)/g, '') // remove (admin) etc
        .toLowerCase()
        .replace(/[_\s]+/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

function findTeamByName(name) {
    if (!Array.isArray(teams)) return null;
    // 1) Exact match first
    let t = teams.find(t => t && t.name === name);
    if (t) return t;
    // 2) Normalized match
    const target = normalizeTeamName(name);
    t = teams.find(t => normalizeTeamName(t && t.name) === target);
    if (t) return t;
    // 3) Fallback: startsWith normalized (handles prefixes/suffixes)
    t = teams.find(t => normalizeTeamName(t && t.name).startsWith(target) || target.startsWith(normalizeTeamName(t && t.name)));
    return t || null;
}

// Render a small WhatsApp icon next to the given team name if that team has a whatsapp number
// But not for the current user's own team (to prevent self-chatting)
function renderTeamWAIcon(teamName) {
    try {
        // Check if this is guest mode first
        const urlParams = new URLSearchParams(window.location.search);
        const isGuest = urlParams.get('guest') === 'true';
        
        if (isGuest) {
            console.log('Guest mode detected, hiding chat icon for:', teamName);
            return ''; // No chat icons for guests
        }
        
        const currentUser = getCurrentUser();
        
        // Debug logging
        console.log('renderTeamWAIcon called for:', teamName);
        console.log('currentUser:', currentUser);
        console.log('currentUser.teamName:', currentUser?.teamName);
        
        // Don't show chat icon for current user's own team
        if (currentUser) {
            // Multiple ways to check if this is the user's team
            const userTeamName = currentUser.teamName;
            const userName = currentUser.username;
            
            // Case-insensitive comparison to handle potential case mismatches
            let isOwnTeam = false;
            
            // Method 1: Direct team name comparison
            if (userTeamName && teamName.toLowerCase() === userTeamName.toLowerCase()) {
                isOwnTeam = true;
            }
            
            // Method 2: Check if team name matches username (some systems do this)
            if (!isOwnTeam && userName && teamName.toLowerCase() === userName.toLowerCase()) {
                isOwnTeam = true;
            }
            
            // Method 3: Check if user owns this team (by looking in teams array)
            if (!isOwnTeam && currentUser.id) {
                const userOwnedTeam = teams.find(t => t.owner === currentUser.id);
                if (userOwnedTeam && teamName.toLowerCase() === userOwnedTeam.name.toLowerCase()) {
                    isOwnTeam = true;
                }
            }
            
            console.log('Team comparison result - isOwnTeam:', isOwnTeam);
            console.log('Methods checked: teamName vs userTeamName, teamName vs userName, teamName vs ownedTeam');
            
            if (isOwnTeam) {
                console.log('Hiding chat icon for own team:', teamName);
                return ''; // No chat icon for own team
            }
        }
        
        const team = findTeamByName(teamName) || {};
        if (team.whatsapp) {
            console.log('Showing chat icon for team:', teamName, 'with WhatsApp:', team.whatsapp);
            return `<a href="https://kirimwa.id/${encodeURIComponent(team.whatsapp)}" target="_blank" style="text-decoration:none; margin-left:6px; font-size:18px;" title="Chat ${teamName} via WhatsApp"><img src="whatsapp.png" alt="WhatsApp" style="width:24px; height:24px; vertical-align:middle;"></a>`;
        }
        console.log('No WhatsApp number for team:', teamName);
        return '';
    } catch (e) {
        console.error('Error in renderTeamWAIcon:', e);
        return '';
    }
}

// Auth helpers
function getCurrentUser() {
    try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch (_) { return null; }
}
function isAdminRole() {
    const user = getCurrentUser();
    return !!(user && (user.role === 'admin' || user.username === 'admin'));
}

// Tab switching
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');

    // Load data for specific tabs
    if (tabName === 'klasemen') {
        loadStandings();
    } else if (tabName === 'jadwal') {
        loadMatches();
        // Load admin data so admin functions work from jadwal tab
        loadPendingResults();
    } else if (tabName === 'input-hasil') {
        loadMatchOptions();
        // Load admin data for potential admin functions
        loadPendingResults();
    } else if (tabName === 'admin') {
        loadPendingResults();
        loadTeamOptions();
        loadUsersList();
        loadTeamsSettingsList();
        loadRegistrationSettings();
    } else if (tabName === 'my-pending') {
        loadMyPendingResults();
    }
}

// Load standings
async function loadStandings() {
    const tbody = document.getElementById('standings-body');
    console.log('Loading standings...');
    
    try {
        let loadedTeams = [];
        let loadedMatches = [];
        
        // Try to get teams from API first
        try {
            console.log('Fetching teams from API...');
            const response = await fetch('/api/teams');
            if (response.ok) {
                loadedTeams = await response.json();
                console.log('Teams loaded from API:', loadedTeams.length);
            }
        } catch (error) {
            console.log('API not available, using localStorage', error);
        }
        
        // Fallback to localStorage
        if (loadedTeams.length === 0) {
            loadedTeams = JSON.parse(localStorage.getItem('teams') || '[]');
            console.log('Teams loaded from localStorage:', loadedTeams.length);
        }
        
        // Update global teams array - ALWAYS use fresh data from API/localStorage
        // Penting: Ini memastikan data tim admin terupdate ke klasemen
        teams = loadedTeams;
        console.log('Global teams array updated with fresh data:', teams.length);

        // Load matches to compute standings from completed games (home & away counted)
        try {
            console.log('Fetching matches from API for standings computation...');
            const mresp = await fetch('/api/matches');
            if (mresp.ok) {
                loadedMatches = await mresp.json();
                console.log('Matches loaded from API:', loadedMatches.length);
            }
        } catch (error) {
            console.log('API not available for matches, using localStorage', error);
        }
        if (loadedMatches.length === 0) {
            loadedMatches = JSON.parse(localStorage.getItem('matches') || '[]');
            console.log('Matches loaded from localStorage:', loadedMatches.length);
        }

        // Check if there are no teams
        if (teams.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; padding: 40px; color: #666;">
                        <div style="font-size: 48px; margin-bottom: 15px;">🏆</div>
                        <h3 style="margin: 0 0 10px 0; color: #667eea;">Liga Belum Dimulai</h3>
                        <p style="margin: 0;">Tambahkan user di panel admin untuk memulai liga</p>
                    </td>
                </tr>
            `;
            return;
        }

        // Build a computed standings map from matches to avoid stale data
        // Start by creating a clone with zeroed stats for each team
        const computedMap = new Map();
        teams.forEach(t => {
            if (!t) return;
            computedMap.set(t.id || t.name, {
                id: t.id,
                name: t.name,
                logo: t.logo,
                played: 0,
                won: 0,
                drawn: 0,
                lost: 0,
                goalsFor: 0,
                goalsAgainst: 0
            });
        });

        // Aggregate only completed matches, counting both home and away sides
        loadedMatches.filter(m => m && m.status === 'completed').forEach(m => {
            const home = findTeamByName(m.homeTeam);
            const away = findTeamByName(m.awayTeam);
            if (!home || !away) return;

            const homeKey = home.id || home.name;
            const awayKey = away.id || away.name;
            const h = computedMap.get(homeKey);
            const a = computedMap.get(awayKey);
            if (!h || !a) return;

            const hs = Number(m.homeScore || 0);
            const as = Number(m.awayScore || 0);

            // Played
            h.played += 1;
            a.played += 1;
            // Goals
            h.goalsFor += hs;
            h.goalsAgainst += as;
            a.goalsFor += as;
            a.goalsAgainst += hs;
            // W/D/L
            if (hs > as) {
                h.won += 1;
                a.lost += 1;
            } else if (hs < as) {
                a.won += 1;
                h.lost += 1;
            } else {
                h.drawn += 1;
                a.drawn += 1;
            }
        });

        const computedTeams = Array.from(computedMap.values());

        const sortedTeams = computedTeams.sort((a, b) => {
            const pointsA = (a.won * 3) + (a.drawn * 1);
            const pointsB = (b.won * 3) + (b.drawn * 1);
            if (pointsB !== pointsA) return pointsB - pointsA;
            return (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst);
        });

        tbody.innerHTML = '';
        sortedTeams.forEach((team, index) => {
            const points = (team.won * 3) + (team.drawn * 1);
            const goalDiff = team.goalsFor - team.goalsAgainst;
            const initials = (team.name || '--')
                .split(' ')
                .map(w => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
            const teamCell = team.logo
                ? `<div style="display:inline-flex;align-items:center;gap:8px;"><img src="${team.logo}" alt="${team.name}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;border:1px solid #e0e6ed;" /><strong>${team.name}</strong></div>`
                : `<div style="display:inline-flex;align-items:center;gap:8px;"><div style="width:24px;height:24px;border-radius:50%;background:#e8edff;color:#667eea;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:1px solid #e0e6ed;">${initials}</div><strong>${team.name}</strong></div>`;
            const row = `
                <tr>
                    <td class="standings-position">${index + 1}</td>
                    <td>${teamCell}</td>
                    <td>${team.played}</td>
                    <td>${team.won}</td>
                    <td>${team.drawn}</td>
                    <td>${team.lost}</td>
                    <td>${team.goalsFor}</td>
                    <td>${team.goalsAgainst}</td>
                    <td>${goalDiff > 0 ? '+' + goalDiff : goalDiff}</td>
                    <td><strong>${points}</strong></td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
        
    } catch (error) {
        console.error('Error loading standings:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; padding: 40px; color: #dc3545;">
                    <div style="font-size: 48px; margin-bottom: 15px;">⚠️</div>
                    <h3 style="margin: 0 0 10px 0; color: #dc3545;">Error Loading Data</h3>
                    <p style="margin: 0;">Gagal memuat data klasemen</p>
                </td>
            </tr>
        `;
    }
}

// Global variables for matchday navigation
let currentMatchdayIndex = 0;
let totalMatchdays = 1;

// Load matches from database/API with localStorage fallback
async function loadMatches() {
    try {
        // Try to load matches from API first
        try {
            const response = await fetch('/api/matches');
            if (response.ok) {
                const loadedMatches = await response.json();
                matches = loadedMatches;
                console.log('Matches loaded from database:', matches.length);
            }
        } catch (error) {
            console.log('API not available, using localStorage');
        }
        
        // Fallback to localStorage if API failed or returned empty
        if (matches.length === 0) {
            matches = JSON.parse(localStorage.getItem('matches') || '[]');
            console.log('Matches loaded from localStorage:', matches.length);
        }
        
    } catch (error) {
        console.error('Error loading matches:', error);
        matches = [];
    }
    
    // Display matches in UI
    displayMatches();
}

// Display matches in the UI (separated for clarity)
function displayMatches() {
    const container = document.getElementById('matchday-container');
    const indicators = document.getElementById('matchday-indicators');
    
    if (!container || !indicators) return;
    
    container.innerHTML = '';
    indicators.innerHTML = '';

    // Group matches by matchday
    const matchesByMatchday = {};
    matches.forEach(match => {
        if (!matchesByMatchday[match.matchday]) {
            matchesByMatchday[match.matchday] = [];
        }
        matchesByMatchday[match.matchday].push(match);
    });

    // Sort matchdays
    const sortedMatchdays = Object.keys(matchesByMatchday).sort((a, b) => parseInt(a) - parseInt(b));
    totalMatchdays = sortedMatchdays.length;

    // Reset current index if needed
    if (currentMatchdayIndex >= totalMatchdays) {
        currentMatchdayIndex = Math.max(0, totalMatchdays - 1);
    }

    if (sortedMatchdays.length === 0) {
        // Show empty state
        container.innerHTML = `
            <div class="matchday-slide">
                <div class="empty-matchday">
                    <i>📅</i>
                    <h3>Belum Ada Jadwal</h3>
                    <p>Gunakan fitur "Generate Jadwal Liga" di panel admin untuk membuat jadwal pertandingan</p>
                </div>
            </div>
        `;
        updateMatchdayNavigation();
        return;
    }

    // Create slides for each matchday
    sortedMatchdays.forEach((matchday, index) => {
        const matchdayMatches = matchesByMatchday[matchday];
        
        // Get date range for this matchday
        const dates = matchdayMatches.map(m => new Date(m.date));
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        const dateRange = minDate.toLocaleDateString('id-ID', { 
            day: 'numeric', 
            month: 'short' 
        }) + (minDate.getTime() !== maxDate.getTime() ? 
            ' - ' + maxDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 
            ''
        );

        let slideContent = `
            <div class="matchday-slide">
                <div class="matchday-header">
                    <h3>🏆 Matchday ${matchday}</h3>
                    <div class="date-info">${dateRange}</div>
                </div>
        `;

        matchdayMatches.forEach(match => {
            const matchDate = new Date(match.date + 'T' + match.time);
            const formattedDate = matchDate.toLocaleDateString('id-ID', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long' 
            });
            
            let statusDisplay = '';
            let statusColor = '';
            let screenshotSection = '';
            let adminButtons = '';
            
            if (match.status === 'scheduled') {
                statusDisplay = '📅 Terjadwal';
                statusColor = '#2196f3';
            } else if (match.status === 'completed') {
                statusDisplay = `✅ ${match.homeScore} - ${match.awayScore}`;
                statusColor = '#4caf50';
                
                // Add screenshot section for completed matches
                if (match.screenshotData) {
                    screenshotSection = `
                        <div style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #4caf50;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <span style="font-weight: 600; color: #4caf50;">📸 Bukti Screenshot</span>
                                <button onclick="viewScreenshot('${match.id}')" style="background: #4caf50; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">
                                    🔍 Lihat Bukti
                                </button>
                            </div>
                            <div style="font-size: 12px; color: #666;">
                                File: ${match.screenshotName || 'screenshot.jpg'}
                            </div>
                            ${match.notes ? `<div style="font-size: 12px; color: #666; margin-top: 5px;"><strong>Catatan:</strong> ${match.notes}</div>` : ''}
                        </div>
                    `;
                }
            }

            // Admin edit controls on Jadwal
            if (isAdminRole()) {
                adminButtons = `
                    <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
                        <button onclick="openEditMatch(${match.id})">✏️ ${match.status === 'completed' ? 'Edit Hasil' : 'Input Hasil'}</button>
                    </div>
                `;
            }
            
            slideContent += `
                <div class="match-card">
                    <div class="match-header">
                        <div class="teams">
                            ${match.homeTeam} ${renderTeamWAIcon ? renderTeamWAIcon(match.homeTeam) : ''}
                            <span style="margin: 0 8px; color: #999; font-weight: 600;">vs</span>
                            ${match.awayTeam} ${renderTeamWAIcon ? renderTeamWAIcon(match.awayTeam) : ''}
                        </div>
                        <div class="match-time">${formattedDate} - ${match.time}</div>
                    </div>
                    <div style="color: ${statusColor}; font-weight: bold;">
                        Status: ${statusDisplay}
                    </div>
                    ${screenshotSection}
                    ${adminButtons}
                </div>
            `;
        });

        slideContent += '</div>';
        container.innerHTML += slideContent;

        // Create indicator
        const indicator = document.createElement('div');
        indicator.className = `indicator ${index === currentMatchdayIndex ? 'active' : ''}`;
        indicator.onclick = () => goToMatchday(index);
        indicator.title = `Matchday ${matchday}`;
        indicators.appendChild(indicator);
    });

    // Update slider position
    updateSliderPosition();
    updateMatchdayNavigation();
}

// Update slider position
function updateSliderPosition() {
    const container = document.getElementById('matchday-container');
    const translateX = -currentMatchdayIndex * 100;
    container.style.transform = `translateX(${translateX}%)`;
}

// Update navigation buttons and info
function updateMatchdayNavigation() {
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const titleElement = document.getElementById('current-matchday-title');
    const counterElement = document.getElementById('matchday-counter');

    // Update buttons state
    prevBtn.disabled = currentMatchdayIndex <= 0;
    nextBtn.disabled = currentMatchdayIndex >= totalMatchdays - 1;

    // Update title and counter
    if (totalMatchdays > 0) {
        const matchesByMatchday = {};
        matches.forEach(match => {
            if (!matchesByMatchday[match.matchday]) {
                matchesByMatchday[match.matchday] = [];
            }
            matchesByMatchday[match.matchday].push(match);
        });
        const sortedMatchdays = Object.keys(matchesByMatchday).sort((a, b) => parseInt(a) - parseInt(b));
        const currentMatchdayNumber = sortedMatchdays[currentMatchdayIndex] || '1';
        
        titleElement.textContent = `Matchday ${currentMatchdayNumber}`;
        counterElement.textContent = `${currentMatchdayIndex + 1} / ${totalMatchdays}`;
    } else {
        titleElement.textContent = 'Belum Ada Jadwal';
        counterElement.textContent = '0 / 0';
    }

    // Update indicators
    document.querySelectorAll('.indicator').forEach((indicator, index) => {
        indicator.classList.toggle('active', index === currentMatchdayIndex);
    });
}

// Change matchday (prev/next)
function changeMatchday(direction) {
    const newIndex = currentMatchdayIndex + direction;
    if (newIndex >= 0 && newIndex < totalMatchdays) {
        currentMatchdayIndex = newIndex;
        updateSliderPosition();
        updateMatchdayNavigation();
    }
}

// Go to specific matchday
function goToMatchday(index) {
    if (index >= 0 && index < totalMatchdays) {
        currentMatchdayIndex = index;
        updateSliderPosition();
        updateMatchdayNavigation();
    }
}

// Add keyboard navigation
document.addEventListener('keydown', function(e) {
    // Only work when jadwal tab is active
    if (document.getElementById('jadwal').classList.contains('active')) {
        if (e.key === 'ArrowLeft') {
            changeMatchday(-1);
            e.preventDefault();
        } else if (e.key === 'ArrowRight') {
            changeMatchday(1);
            e.preventDefault();
        }
    }
});

// Admin: open edit dialog for a match (create or edit pending result)
window.openEditMatch = function(matchId) {
    if (!isAdminRole()) return;
    const match = matches.find(m => m.id == matchId);
    if (!match) return;

    const modal = document.createElement('div');
    modal.id = 'editMatchModal';
    modal.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:2100;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:12px;padding:20px;max-width:520px;width:90%;">
            <h3 style="margin:0 0 10px;color:#667eea;">${match.homeTeam} vs ${match.awayTeam}</h3>
            <div class="form-group">
                <label>Skor ${match.homeTeam}</label>
                <input type="number" id="edit-match-home" min="0" value="${match.homeScore ?? ''}" />
            </div>
            <div class="form-group">
                <label>Skor ${match.awayTeam}</label>
                <input type="number" id="edit-match-away" min="0" value="${match.awayScore ?? ''}" />
            </div>
            <div class="form-group">
                <label>Ganti/Tambah Screenshot Bukti (opsional)</label>
                <input type="file" id="edit-match-file" accept="image/*,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tiff,.tif,.svg,.ico,.heic,.heif,.avif" />
            </div>
            <div class="form-group">
                <label>Catatan (opsional)</label>
                <textarea id="edit-match-notes" rows="3">${match.notes || ''}</textarea>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
                <button id="btn-cancel-match">Batal</button>
                <button id="btn-save-match" style="background:#4caf50;">Simpan</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#btn-cancel-match').onclick = () => modal.remove();
    modal.querySelector('#btn-save-match').onclick = async () => {
        const newHome = parseInt(document.getElementById('edit-match-home').value || '0');
        const newAway = parseInt(document.getElementById('edit-match-away').value || '0');
        const file = document.getElementById('edit-match-file').files[0];
        const notes = (document.getElementById('edit-match-notes').value || '').trim();

        // If match already completed, adjust team stats by reverting old result first
        const wasCompleted = match.status === 'completed';
        let prevResult = null;
        if (wasCompleted) {
            prevResult = {
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                homeScore: match.homeScore || 0,
                awayScore: match.awayScore || 0
            };
        }

        // Prepare update to match record
        match.status = 'completed';
        match.homeScore = newHome;
        match.awayScore = newAway;
        match.notes = notes;

        // Handle screenshot if provided
        if (file) {
            try {
                const b64 = await fileToBase64(file);
                match.screenshotData = b64;
                match.screenshotName = file.name;
            } catch (_) {}
        }

        // Save match to server/local
        try {
            await fetch(`/api/matches/${match.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(match)
            });
        } catch (_) {
            localStorage.setItem('matches', JSON.stringify(matches));
        }

        // Update team stats: if was completed, revert old, then apply new
        if (wasCompleted && prevResult) {
            await revertTeamStats(prevResult);
        }
        await updateTeamStats({
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            homeScore: newHome,
            awayScore: newAway
        });

        // Refresh UI - ensure we get fresh data from server
        try {
            // Explicitly fetch fresh team data from API
            console.log('Explicitly fetching fresh team data after match edit');
            const teamsResponse = await fetch('/api/teams');
            if (teamsResponse.ok) {
                teams = await teamsResponse.json();
                console.log('Teams reloaded after match edit:', teams.length);
            }
        } catch (error) {
            console.log('Could not reload teams from API after match edit');
        }
        
        await loadMatches();
        await loadStandings();

        modal.remove();
    };
};

// Revert team statistics for a previously recorded result
async function revertTeamStats(result) {
    // Ensure teams are loaded from database - explicitly fetch fresh data
    try {
        console.log('Explicitly fetching fresh team data from API before reverting stats');
        const teamsResponse = await fetch('/api/teams');
        if (teamsResponse.ok) {
            teams = await teamsResponse.json();
            console.log('Teams loaded directly from API for stats reversion:', teams.length);
        } else {
            // Fallback to loadTeamOptions if direct fetch fails
            await loadTeamOptions();
        }
    } catch (error) {
        console.log('API fetch failed when reverting stats, falling back to loadTeamOptions', error);
        await loadTeamOptions();
    }
    
    const homeTeam = findTeamByName(result.homeTeam);
    const awayTeam = findTeamByName(result.awayTeam);
    
    if (!homeTeam || !awayTeam) {
        console.error('Could not find teams to revert stats for:', result.homeTeam, result.awayTeam);
        return;
    }
    
    console.log('Reverting team stats for match:', result.homeTeam, result.homeScore, '-', result.awayScore, result.awayTeam);
    console.log('Team stats before revert:', 
        homeTeam.name, '(played:', homeTeam.played, ')', 
        awayTeam.name, '(played:', awayTeam.played, ')');

    homeTeam.played = Math.max(0, (homeTeam.played || 0) - 1);
    awayTeam.played = Math.max(0, (awayTeam.played || 0) - 1);

    homeTeam.goalsFor = Math.max(0, (homeTeam.goalsFor || 0) - result.homeScore);
    homeTeam.goalsAgainst = Math.max(0, (homeTeam.goalsAgainst || 0) - result.awayScore);
    awayTeam.goalsFor = Math.max(0, (awayTeam.goalsFor || 0) - result.awayScore);
    awayTeam.goalsAgainst = Math.max(0, (awayTeam.goalsAgainst || 0) - result.homeScore);

    if (result.homeScore > result.awayScore) {
        homeTeam.won = Math.max(0, (homeTeam.won || 0) - 1);
        awayTeam.lost = Math.max(0, (awayTeam.lost || 0) - 1);
    } else if (result.homeScore < result.awayScore) {
        awayTeam.won = Math.max(0, (awayTeam.won || 0) - 1);
        homeTeam.lost = Math.max(0, (homeTeam.lost || 0) - 1);
    } else {
        homeTeam.drawn = Math.max(0, (homeTeam.drawn || 0) - 1);
        awayTeam.drawn = Math.max(0, (awayTeam.drawn || 0) - 1);
    }

    try {
        console.log('Saving reverted team stats to API...');
        console.log('Reverting homeTeam:', homeTeam.name, 'played:', homeTeam.played, 'won:', homeTeam.won, 'drawn:', homeTeam.drawn, 'lost:', homeTeam.lost);
        console.log('Reverting awayTeam:', awayTeam.name, 'played:', awayTeam.played, 'won:', awayTeam.won, 'drawn:', awayTeam.drawn, 'lost:', awayTeam.lost);
        
        const responses = await Promise.all([
            fetch(`/api/teams/${homeTeam.id}`, { 
                method: 'PUT', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(homeTeam) 
            }),
            fetch(`/api/teams/${awayTeam.id}`, { 
                method: 'PUT', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(awayTeam) 
            })
        ]);
        
        // Verifikasi respons API
        const responseResults = await Promise.all(responses.map(r => r.ok ? r.json() : null));
        console.log('Teams reverted in database:', responses.every(r => r.ok));
        if (responseResults[0]) console.log('Home team reverted in DB:', responseResults[0].name, 'played:', responseResults[0].played);
        if (responseResults[1]) console.log('Away team reverted in DB:', responseResults[1].name, 'played:', responseResults[1].played);
        
        // Force refresh of teams data from server
        const refreshResponse = await fetch('/api/teams');
        if (refreshResponse.ok) {
            teams = await refreshResponse.json();
            console.log('Teams reloaded from server after revert:', teams.length);
        }
    } catch (error) {
        console.log('API not available, teams reverted in memory only', error);
        // Update localStorage as fallback
        let stored = JSON.parse(localStorage.getItem('teams') || '[]');
        const hi = stored.findIndex(t => t.id === homeTeam.id);
        const ai = stored.findIndex(t => t.id === awayTeam.id);
        if (hi !== -1) stored[hi] = homeTeam;
        if (ai !== -1) stored[ai] = awayTeam;
        localStorage.setItem('teams', JSON.stringify(stored));
        
        // Update global teams array to ensure it has the latest data
        teams = stored;
    }
}

// Load match options for result input
function loadMatchOptions() {
    const select = document.getElementById('match-select');
    select.innerHTML = '<option value="">Pilih pertandingan...</option>';

    matches.filter(match => match.status === 'scheduled').forEach(match => {
        const option = `<option value="${match.id}">Matchday ${match.matchday}: ${match.homeTeam} vs ${match.awayTeam} (${match.date})</option>`;
        select.innerHTML += option;
    });
}

// File upload preview - moved to initialization function to ensure DOM is ready
function initializeFileUpload() {
    const screenshotInput = document.getElementById('screenshot');
    if (screenshotInput) {
        screenshotInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            const preview = document.getElementById('file-preview');
            
            if (file) {
                // Validate file format
                const allowedFormats = [
                    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 
                    'image/webp', 'image/tiff', 'image/tif', 'image/svg+xml', 'image/ico',
                    'image/x-icon', 'image/heic', 'image/heif', 'image/avif'
                ];
                const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.svg', '.ico', '.heic', '.heif', '.avif'];
                
                const fileType = (file.type || '').toLowerCase();
                const fileName = (file.name || '').toLowerCase();
                const hasAllowedMime = fileType && allowedFormats.includes(fileType);
                const hasAllowedExt = allowedExtensions.some(ext => fileName.endsWith(ext));

                if (!hasAllowedMime && !hasAllowedExt) {
                    preview.innerHTML = `
                        <div style="margin-top: 15px; padding: 10px; background: #ffebee; border: 1px solid #f44336; border-radius: 8px; color: #c62828;">
                            <p><strong>❌ Format file tidak didukung!</strong></p>
                            <p>Format yang didukung: JPG, JPEG, PNG, GIF, BMP, WEBP, TIFF, SVG, ICO, HEIC, HEIF, AVIF</p>
                        </div>
                    `;
                    e.target.value = ''; // Clear the input
                    return;
                }
                
                // Validate file size (30MB maximum to account for base64 encoding)
                const maxSize = 30 * 1024 * 1024; // 30MB in bytes
                if (file.size > maxSize) {
                    preview.innerHTML = `
                        <div style="margin-top: 15px; padding: 10px; background: #ffebee; border: 1px solid #f44336; border-radius: 8px; color: #c62828;">
                            <p><strong>❌ File terlalu besar!</strong></p>
                            <p>Ukuran maksimal: 30MB. Ukuran file Anda: ${(file.size / (1024 * 1024)).toFixed(2)}MB</p>
                            <p>💡 Tip: Kompres gambar atau gunakan format JPEG untuk ukuran lebih kecil.</p>
                        </div>
                    `;
                    e.target.value = ''; // Clear the input
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
                    preview.innerHTML = `
                        <div style="margin-top: 15px; padding: 10px; background: #e8f5e8; border: 1px solid #4caf50; border-radius: 8px;">
                            <p><strong>✅ File dipilih:</strong> ${file.name}</p>
                            <p><strong>Format:</strong> ${file.type.toUpperCase().replace('IMAGE/', '')}</p>
                            <p><strong>Ukuran:</strong> ${fileSizeMB}MB</p>
                            <img src="${e.target.result}" style="max-width: 200px; max-height: 200px; border-radius: 8px; margin-top: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        </div>
                    `;
                };
                reader.readAsDataURL(file);
            }
        });
    }
}

// Submit result form - moved to initialization function
function initializeResultForm() {
    const resultForm = document.getElementById('result-form');
    if (resultForm) {
        resultForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const matchId = document.getElementById('match-select').value;
            const homeScore = document.getElementById('home-score').value;
            const awayScore = document.getElementById('away-score').value;
            const screenshot = document.getElementById('screenshot').files[0];
            const notes = document.getElementById('notes').value;

            const match = matches.find(m => m.id == matchId);
            const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
            
            const pendingResult = {
                matchId: matchId,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                homeScore: parseInt(homeScore),
                awayScore: parseInt(awayScore),
                screenshot: screenshot,
                notes: notes,
                submittedAt: new Date().toLocaleString('id-ID'),
                status: 'pending',
                submittedBy: currentUser ? { id: currentUser.id, username: currentUser.username, teamName: currentUser.teamName, role: currentUser.role } : null
            };

            try {
                // Validate screenshot before submission
                if (screenshot) {
                    // Check if the screenshot is too large for base64 encoding
                    const estimatedBase64Size = (screenshot.size * 4) / 3; // Base64 is ~33% larger
                    const maxBase64Size = 40 * 1024 * 1024; // 40MB for base64 data
                    
                    if (estimatedBase64Size > maxBase64Size) {
                        const alertDiv = document.createElement('div');
                        alertDiv.className = 'alert alert-error';
                        alertDiv.innerHTML = `
                            ⚠️ Gambar terlalu besar untuk dikirim ke server! 
                            <br>Ukuran file: ${(screenshot.size / (1024 * 1024)).toFixed(2)}MB
                            <br>💡 Silakan kompres gambar atau gunakan format JPEG dengan kualitas lebih rendah.
                        `;
                        document.getElementById('input-hasil').insertBefore(alertDiv, document.getElementById('input-hasil').firstChild);
                        setTimeout(() => alertDiv.remove(), 8000);
                        return;
                    }
                }
                
                // Save to database first
                const response = await fetch('/api/pending-results', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...pendingResult,
                        // Convert file to base64 for database storage
                        screenshotData: screenshot ? await fileToBase64(screenshot) : null,
                        screenshotName: screenshot ? screenshot.name : null
                    })
                });
                
                if (response.status === 413) {
                    // Handle payload too large error
                    const alertDiv = document.createElement('div');
                    alertDiv.className = 'alert alert-error';
                    alertDiv.innerHTML = `
                        ❌ File gambar terlalu besar untuk server! 
                        <br>Server menolak upload karena ukuran file melebihi batas.
                        <br>💡 Silakan kompres gambar atau gunakan format JPEG dengan kualitas lebih rendah.
                        <br>📊 Ukuran yang disarankan: Maksimal 15MB
                    `;
                    document.getElementById('input-hasil').insertBefore(alertDiv, document.getElementById('input-hasil').firstChild);
                    setTimeout(() => alertDiv.remove(), 10000);
                    return;
                }
                
                if (response.ok) {
                    console.log('Pending result saved to database');
                    try {
                        const saved = await response.json();
                        // Prefer server ID for consistency with admin actions
                        pendingResult.id = saved && saved.id ? saved.id : pendingResult.id;
                    } catch (_) {}
                } else {
                    console.log('Server error:', response.status);
                }
            } catch (error) {
                console.log('API not available or error occurred:', error.message);
                
                // Check if it's a network error related to large payload
                if (error.message.includes('Failed to fetch') && screenshot && screenshot.size > 10 * 1024 * 1024) {
                    const alertDiv = document.createElement('div');
                    alertDiv.className = 'alert alert-error';
                    alertDiv.innerHTML = `
                        ⚠️ Koneksi terputus - kemungkinan gambar terlalu besar! 
                        <br>💡 Coba kompres gambar atau gunakan koneksi internet yang lebih stabil.
                    `;
                    document.getElementById('input-hasil').insertBefore(alertDiv, document.getElementById('input-hasil').firstChild);
                    setTimeout(() => alertDiv.remove(), 8000);
                    return;
                }
            }
            
            // Also save to local array for immediate display
            if (!pendingResult.id) pendingResult.id = resultIdCounter++;
            pendingResults.push(pendingResult);
            localStorage.setItem('pendingResults', JSON.stringify(pendingResults));
            
            // Auto-approve immediately if the submitter is an admin
            const isAdminUser = currentUser && (currentUser.role === 'admin' || currentUser.username === 'admin');
            if (isAdminUser) {
                try {
                    await approveResult(pendingResult.id);
                } catch (e) {
                    console.warn('Auto-approve by admin failed, leaving as pending:', e);
                }
            }

            // Show success message (different text for admin)
            const alertDiv = document.createElement('div');
            alertDiv.className = 'alert alert-success';
            alertDiv.innerHTML = isAdminUser
                ? '✅ Hasil disimpan dan langsung disetujui karena Anda admin.'
                : '✅ Hasil pertandingan berhasil dikirim dan menunggu approval admin!';
            document.getElementById('input-hasil').insertBefore(alertDiv, document.getElementById('input-hasil').firstChild);

            // Reset form
            document.getElementById('result-form').reset();
            document.getElementById('file-preview').innerHTML = '';

            setTimeout(() => alertDiv.remove(), 5000);

            // Refresh my pending list if that tab is open
            const myPendingTab = document.getElementById('my-pending');
            if (myPendingTab && myPendingTab.classList.contains('active')) {
                loadMyPendingResults();
            }
        });
    }
}

// Helper function to convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Load pending results for admin from database
async function loadPendingResults() {
    const container = document.getElementById('pending-results');
    if (!container) return;
    
    try {
        // Try to load pending results from API first
        try {
            const response = await fetch('/api/pending-results');
            if (response.ok) {
                const loadedResults = await response.json();
                pendingResults = loadedResults;
                console.log('Pending results loaded from database:', pendingResults.length);
            }
        } catch (error) {
            console.log('API not available, using localStorage');
        }
        
        // Fallback to localStorage if API failed
        if (pendingResults.length === 0) {
            pendingResults = JSON.parse(localStorage.getItem('pendingResults') || '[]');
            console.log('Pending results loaded from localStorage:', pendingResults.length);
        }
        
    } catch (error) {
        console.error('Error loading pending results:', error);
        pendingResults = [];
    }
    
    // Display pending results
    if (pendingResults.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Tidak ada hasil yang menunggu approval.</p>';
        return;
    }

    container.innerHTML = '';
    const admin = isAdminRole();
    pendingResults.filter(result => result.status === 'pending').forEach(result => {
        const adminActions = admin ? `
            <div class="result-actions">
                <button class="btn-approve" onclick="approveResult(${result.id})">✅ Setujui</button>
                <button class="btn-reject" onclick="rejectResult(${result.id})">❌ Tolak</button>
            </div>
        ` : '';

        const resultCard = `
            <div class="pending-result">
                <h4>${result.homeTeam} ${result.homeScore} - ${result.awayScore} ${result.awayTeam}</h4>
                <p><strong>Dikirim pada:</strong> ${result.submittedAt}</p>
                <p><strong>Catatan:</strong> ${result.notes || 'Tidak ada catatan'}</p>
                <p><strong>Screenshot:</strong> ${result.screenshotName || result.screenshot?.name || 'Tidak ada file'}</p>
                ${(result.screenshotData || result.screenshot) ? `
                    <div style="margin: 15px 0; padding: 10px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196f3;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 600; color: #2196f3;">📸 Bukti Tersedia</span>
                            <button onclick=\"viewPendingScreenshot(${result.id})\" style=\"background: #2196f3; color: white; border: none; padding: 6px 12px; border-radius: 5px; cursor: pointer; font-size: 12px;\">🔍 Lihat Bukti</button>
                        </div>
                    </div>
                ` : ''}
                ${adminActions}
            </div>
        `;
        container.innerHTML += resultCard;
    });
}

// Approve result
// Approve result and save to database
async function approveResult(resultId) {
    if (!isAdminRole()) {
        alert('Hanya admin yang dapat menyetujui hasil.');
        return;
    }
    const result = pendingResults.find(r => r.id === resultId);
    if (result) {
        result.status = 'approved';
        
        // Update match status and store screenshot data
        const match = matches.find(m => m.id == result.matchId);
        if (match) {
            match.status = 'completed';
            match.homeScore = result.homeScore;
            match.awayScore = result.awayScore;
            match.notes = result.notes;
            match.submittedAt = result.submittedAt;
            
            // Handle screenshot data
            if (result.screenshot) {
                // If screenshot is already base64 data
                if (result.screenshotData) {
                    match.screenshotData = result.screenshotData;
                    match.screenshotName = result.screenshotName || result.screenshot.name;
                } else if (result.screenshot instanceof File) {
                    // If screenshot is a File object, convert to base64
                    const reader = new FileReader();
                    reader.onload = async function(e) {
                        match.screenshotData = e.target.result;
                        match.screenshotName = result.screenshot.name;
                        
                        // Save updated match to database
                        try {
                            await fetch(`/api/matches/${match.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(match)
                            });
                            console.log('Match updated in database with screenshot');
                        } catch (error) {
                            console.log('API not available, saving to localStorage');
                            localStorage.setItem('matches', JSON.stringify(matches));
                        }
                        
                        // Complete approval process after screenshot is processed
                        await completeApprovalProcess(resultId, result);
                        
                        // Refresh matches display after screenshot is loaded
                        await loadMatches();
                    };
                    reader.readAsDataURL(result.screenshot);
                    return; // Exit early since the rest will be handled in the onload callback
                }
                
                // Save updated match to database
                try {
                    await fetch(`/api/matches/${match.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(match)
                    });
                    console.log('Match updated in database with screenshot');
                } catch (error) {
                    console.log('API not available, saving to localStorage');
                    localStorage.setItem('matches', JSON.stringify(matches));
                }
            } else {
                // Save updated match to database (without screenshot)
                try {
                    await fetch(`/api/matches/${match.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(match)
                    });
                    console.log('Match updated in database');
                } catch (error) {
                    console.log('API not available, saving to localStorage');
                    localStorage.setItem('matches', JSON.stringify(matches));
                }
            }
        }

        // Complete approval process
        await completeApprovalProcess(resultId, result);
    }
}

// Helper function to complete the approval process
async function completeApprovalProcess(resultId, result) {
    console.log('Starting approval process for result:', resultId);
    
    // Update team statistics (this function already handles database saving)
    await updateTeamStats(result);
    
    // Remove from pending results in database
    try {
        await fetch(`/api/pending-results/${resultId}`, {
            method: 'DELETE'
        });
        console.log('Pending result removed from database');
    } catch (error) {
        console.log('API not available for deleting pending result');
    }
    
    // Remove from local array
    const resultIndex = pendingResults.findIndex(r => r.id === resultId);
    if (resultIndex !== -1) {
        pendingResults.splice(resultIndex, 1);
    }
    
    // Update localStorage
    localStorage.setItem('pendingResults', JSON.stringify(pendingResults));
    
    // Force reload of matches data
    await loadMatches();
    
    // Refresh displays - ensure standings are updated
    loadPendingResults();
    
    // Force reload of teams data and update standings
    try {
        // Explicitly fetch fresh team data from API
        console.log('Explicitly fetching fresh team data from API before updating standings');
        const teamsResponse = await fetch('/api/teams');
        if (teamsResponse.ok) {
            teams = await teamsResponse.json();
            console.log('Teams reloaded before updating standings:', teams.length);
        }
    } catch (error) {
        console.log('Could not reload teams from API, using current data');
    }
    
    // Update standings with latest team data
    await loadStandings();
    console.log('Standings updated after match result approval');
    
    // Show success message
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-success';
    alertDiv.innerHTML = '✅ Hasil pertandingan berhasil disetujui dan ditambahkan ke sistem!';
    document.getElementById('admin').insertBefore(alertDiv, document.getElementById('admin').firstChild);
    setTimeout(() => alertDiv.remove(), 5000);
}

// Reject result
async function rejectResult(resultId) {
    if (!isAdminRole()) {
        alert('Hanya admin yang dapat menolak hasil.');
        return;
    }
    const result = pendingResults.find(r => r.id === resultId);
    if (result) {
        result.status = 'rejected';
        
        // Remove from pending results in database
        try {
            await fetch(`/api/pending-results/${resultId}`, {
                method: 'DELETE'
            });
            console.log('Pending result removed from database');
        } catch (error) {
            console.log('API not available for deleting pending result');
        }
        
        // Remove from local array
        const resultIndex = pendingResults.findIndex(r => r.id === resultId);
        if (resultIndex !== -1) {
            pendingResults.splice(resultIndex, 1);
        }
        
        // Update localStorage
        localStorage.setItem('pendingResults', JSON.stringify(pendingResults));
        
        await loadPendingResults();
        
        // Show warning message
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-warning';
        alertDiv.innerHTML = '⚠️ Hasil pertandingan ditolak!';
        document.getElementById('admin').insertBefore(alertDiv, document.getElementById('admin').firstChild);
        setTimeout(() => alertDiv.remove(), 5000);
    }
}

// Load pending results for the logged-in (non-admin) user
async function loadMyPendingResults() {
    const container = document.getElementById('my-pending-results');
    if (!container) return;
    
    let currentUser = null;
    try {
        currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    } catch (_) {}
    
    try {
        // Try to load pending results from API first
        try {
            const response = await fetch('/api/pending-results');
            if (response.ok) {
                const loadedResults = await response.json();
                pendingResults = loadedResults;
            }
        } catch (error) {
            // fallback below
        }
        // Fallback to localStorage
        if (!Array.isArray(pendingResults) || pendingResults.length === 0) {
            pendingResults = JSON.parse(localStorage.getItem('pendingResults') || '[]');
        }
    } catch (error) {
        pendingResults = [];
    }
    
    // Filter by submitter if available, otherwise by team name
    const filtered = pendingResults.filter(r => {
        if (!currentUser) return false;
        if (r.submittedBy && r.submittedBy.username) {
            return r.submittedBy.username === currentUser.username;
        }
        // fallback heuristic: involve current user's team
        return r.homeTeam === currentUser.teamName || r.awayTeam === currentUser.teamName;
    }).filter(r => r.status === 'pending');
    
    if (filtered.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Tidak ada kiriman Anda yang menunggu approval.</p>';
        return;
    }
    
    container.innerHTML = '';
    filtered.forEach(result => {
        const canEdit = (result.submittedBy && getCurrentUser() && result.submittedBy.username === getCurrentUser().username);
        const editButtons = canEdit ? `
            <div class="result-actions" style="margin-top:10px; gap:6px; display:flex; flex-wrap:wrap;">
                <button onclick="openEditPending(${result.id})">✏️ Edit Skor/Foto</button>
            </div>
        ` : '';

        const card = `
            <div class="pending-result">
                <h4>${result.homeTeam} ${result.homeScore} - ${result.awayScore} ${result.awayTeam}</h4>
                <p><strong>Dikirim pada:</strong> ${result.submittedAt || '-'}</p>
                ${result.submittedBy && result.submittedBy.username ? `<p><strong>Dikirim oleh:</strong> ${result.submittedBy.username}</p>` : ''}
                <p><strong>Catatan:</strong> ${result.notes || 'Tidak ada catatan'}</p>
                <p><strong>Screenshot:</strong> ${result.screenshotName || result.screenshot?.name || 'Tidak ada file'}</p>
                ${(result.screenshotData || result.screenshot) ? `
                    <div style="margin: 15px 0; padding: 10px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196f3;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 600; color: #2196f3;">📸 Bukti Tersedia</span>
                            <button onclick="viewPendingScreenshot(${result.id})" style="background: #2196f3; color: white; border: none; padding: 6px 12px; border-radius: 5px; cursor: pointer; font-size: 12px;">🔍 Lihat Bukti</button>
                        </div>
                    </div>
                ` : ''}
                ${editButtons}
            </div>
        `;
        container.innerHTML += card;
    });
}

// Open edit modal for pending result (user-owned)
window.openEditPending = function(resultId) {
    const result = pendingResults.find(r => r.id === resultId);
    const user = getCurrentUser();
    if (!result || !user || !(result.submittedBy && result.submittedBy.username === user.username)) return;

    const modal = document.createElement('div');
    modal.id = 'editPendingModal';
    modal.style.cssText = `position:fixed;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:2100;display:flex;align-items:center;justify-content:center;`;
    modal.innerHTML = `
        <div style="background:#fff;border-radius:12px;padding:20px;max-width:480px;width:90%;">
            <h3 style="margin:0 0 10px 0;color:#667eea;">✏️ Edit Kiriman Pending</h3>
            <div class="form-group">
                <label>Skor Tim Kandang (${result.homeTeam})</label>
                <input type="number" id="edit-home-score" min="0" value="${result.homeScore}">
            </div>
            <div class="form-group">
                <label>Skor Tim Tandang (${result.awayTeam})</label>
                <input type="number" id="edit-away-score" min="0" value="${result.awayScore}">
            </div>
            <div class="form-group">
                <label>Ganti Screenshot Bukti (opsional)</label>
                <input type="file" id="edit-screenshot" accept="image/*,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tiff,.tif,.svg,.ico,.heic,.heif,.avif">
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
                <button id="btn-cancel-edit">Batal</button>
                <button id="btn-save-edit" style="background:#4caf50;">Simpan</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#btn-cancel-edit').onclick = () => modal.remove();
    modal.querySelector('#btn-save-edit').onclick = async () => {
        const newHome = parseInt(document.getElementById('edit-home-score').value || '0');
        const newAway = parseInt(document.getElementById('edit-away-score').value || '0');
        const file = document.getElementById('edit-screenshot').files[0];

        // Prepare payload
        const updatePayload = { homeScore: newHome, awayScore: newAway };
        if (file) {
            try {
                const b64 = await fileToBase64(file);
                updatePayload.screenshotData = b64;
                updatePayload.screenshotName = file.name;
                // Keep a client-side File reference for preview
                result.screenshot = file;
            } catch (_) {}
        }

        // Update server if possible
        try {
            const resp = await fetch(`/api/pending-results/${resultId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatePayload)
            });
            if (resp.ok) {
                const saved = await resp.json();
                Object.assign(result, saved);
            } else {
                Object.assign(result, updatePayload);
            }
        } catch (_) {
            Object.assign(result, updatePayload);
        }

        // Update local cache
        const idx = pendingResults.findIndex(r => r.id === resultId);
        if (idx !== -1) pendingResults[idx] = { ...pendingResults[idx], ...result };
        localStorage.setItem('pendingResults', JSON.stringify(pendingResults));

        // Refresh user list and admin list if open
        loadMyPendingResults();
        const adminTab = document.getElementById('admin');
        if (adminTab && adminTab.classList.contains('active')) {
            loadPendingResults();
        }

        modal.remove();
    };
};

// Update team statistics based on match result
async function updateTeamStats(result) {
    // Ensure teams are loaded from database - explicitly fetch fresh data
    try {
        console.log('Explicitly fetching fresh team data from API before updating stats');
        const teamsResponse = await fetch('/api/teams');
        if (teamsResponse.ok) {
            teams = await teamsResponse.json();
            console.log('Teams loaded directly from API for stats update:', teams.length);
        } else {
            // Fallback to loadTeamOptions if direct fetch fails
            await loadTeamOptions();
        }
    } catch (error) {
        console.log('API fetch failed, falling back to loadTeamOptions', error);
        await loadTeamOptions();
    }
    
    console.log('Updating team stats for match:', result.homeTeam, result.homeScore, '-', result.awayScore, result.awayTeam);
    
    const homeTeam = findTeamByName(result.homeTeam);
    const awayTeam = findTeamByName(result.awayTeam);

    if (homeTeam && awayTeam) {
        console.log('Found teams to update:', homeTeam.name, awayTeam.name);
        
        // PENTING: Pastikan semua properti statistik diinisialisasi dengan benar
        // Konversi nilai ke number untuk menghindari masalah tipe data
        homeTeam.played = Number(homeTeam.played || 0);
        homeTeam.won = Number(homeTeam.won || 0);
        homeTeam.drawn = Number(homeTeam.drawn || 0);
        homeTeam.lost = Number(homeTeam.lost || 0);
        homeTeam.goalsFor = Number(homeTeam.goalsFor || 0);
        homeTeam.goalsAgainst = Number(homeTeam.goalsAgainst || 0);
        
        awayTeam.played = Number(awayTeam.played || 0);
        awayTeam.won = Number(awayTeam.won || 0);
        awayTeam.drawn = Number(awayTeam.drawn || 0);
        awayTeam.lost = Number(awayTeam.lost || 0);
        awayTeam.goalsFor = Number(awayTeam.goalsFor || 0);
        awayTeam.goalsAgainst = Number(awayTeam.goalsAgainst || 0);
        
        console.log('Team stats before update:', 
            homeTeam.name, '(played:', homeTeam.played, ')', 
            awayTeam.name, '(played:', awayTeam.played, ')');
        
        // Update matches played
        homeTeam.played++;
        awayTeam.played++;

        // Update goals
        homeTeam.goalsFor += result.homeScore;
        homeTeam.goalsAgainst += result.awayScore;
        awayTeam.goalsFor += result.awayScore;
        awayTeam.goalsAgainst += result.homeScore;

        // Update win/draw/loss
        if (result.homeScore > result.awayScore) {
            homeTeam.won++;
            awayTeam.lost++;
        } else if (result.homeScore < result.awayScore) {
            awayTeam.won++;
            homeTeam.lost++;
        } else {
            homeTeam.drawn++;
            awayTeam.drawn++;
        }
        
        console.log('Updated team stats for:', homeTeam.name, 'and', awayTeam.name);
        
        // Save updated teams to database/API
        try {
            console.log('Saving updated team stats to API...');
            console.log('Updating homeTeam:', homeTeam.name, 'played:', homeTeam.played, 'won:', homeTeam.won, 'drawn:', homeTeam.drawn, 'lost:', homeTeam.lost);
            console.log('Updating awayTeam:', awayTeam.name, 'played:', awayTeam.played, 'won:', awayTeam.won, 'drawn:', awayTeam.drawn, 'lost:', awayTeam.lost);
            
            const responses = await Promise.all([
                fetch(`/api/teams/${homeTeam.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(homeTeam)
                }),
                fetch(`/api/teams/${awayTeam.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(awayTeam)
                })
            ]);
            
            // Verifikasi respons API
            const responseResults = await Promise.all(responses.map(r => r.ok ? r.json() : null));
            console.log('Teams updated in database:', responses.every(r => r.ok));
            if (responseResults[0]) console.log('Home team updated in DB:', responseResults[0].name, 'played:', responseResults[0].played);
            if (responseResults[1]) console.log('Away team updated in DB:', responseResults[1].name, 'played:', responseResults[1].played);
            
            // Force refresh of teams data from server
            const refreshResponse = await fetch('/api/teams');
            if (refreshResponse.ok) {
                teams = await refreshResponse.json();
                console.log('Teams reloaded from server after update:', teams.length);
                // Verifikasi data tim setelah reload
                const updatedHomeTeam = teams.find(t => t.id === homeTeam.id);
                const updatedAwayTeam = teams.find(t => t.id === awayTeam.id);
                if (updatedHomeTeam) console.log('Verified homeTeam after reload:', updatedHomeTeam.name, 'played:', updatedHomeTeam.played);
                if (updatedAwayTeam) console.log('Verified awayTeam after reload:', updatedAwayTeam.name, 'played:', updatedAwayTeam.played);
            }
        } catch (error) {
            console.log('API not available, teams updated in memory only', error);
            // Update localStorage as fallback
            let storedTeams = JSON.parse(localStorage.getItem('teams') || '[]');
            const homeIndex = storedTeams.findIndex(t => t.id === homeTeam.id);
            const awayIndex = storedTeams.findIndex(t => t.id === awayTeam.id);
            if (homeIndex !== -1) storedTeams[homeIndex] = homeTeam;
            if (awayIndex !== -1) storedTeams[awayIndex] = awayTeam;
            localStorage.setItem('teams', JSON.stringify(storedTeams));
            
            // Update global teams array to ensure it has the latest data
            teams = storedTeams;
        }
    } else {
        console.error('Could not find teams to update:', result.homeTeam, result.awayTeam);
        console.log('Available teams:', teams.map(t => t.name));
    }
}



// Load team options for admin - teams derived from users
async function loadTeamOptions() {
    const homeSelect = document.getElementById('home-team-select');
    const awaySelect = document.getElementById('away-team-select');
    
    try {
        let users = [];
        let loadedTeams = []; // Use different variable name to avoid confusion
        
        // Try to get users and teams from API first
        try {
            const [usersResponse, teamsResponse] = await Promise.all([
                fetch('/api/users'),
                fetch('/api/teams')
            ]);
            
            if (usersResponse.ok) users = await usersResponse.json();
            if (teamsResponse.ok) loadedTeams = await teamsResponse.json();
        } catch (error) {
            console.log('API not available, using localStorage');
        }
        
        // Fallback to localStorage
        if (users.length === 0) {
            users = JSON.parse(localStorage.getItem('users') || '[]');
        }
        if (loadedTeams.length === 0) {
            loadedTeams = JSON.parse(localStorage.getItem('teams') || '[]');
        }
        
        // Update global teams array with teams from database/API
        teams = loadedTeams; // Update the global teams variable directly
        
        console.log('Teams loaded:', teams.length, teams); // Debug log
        
        const teamOptions = teams.map(team => `<option value="${team.name}">${team.name}</option>`).join('');
        
        if (homeSelect) {
            homeSelect.innerHTML = '<option value="">Pilih tim kandang...</option>' + teamOptions;
        }
        if (awaySelect) {
            awaySelect.innerHTML = '<option value="">Pilih tim tandang...</option>' + teamOptions;
        }
        
        return teams; // Return the teams for use in other functions
        
    } catch (error) {
        console.error('Error loading team options:', error);
        return [];
    }
}









// View screenshot for completed match
function viewScreenshot(matchId) {
    const match = matches.find(m => m.id == matchId);
    if (match && match.screenshotData) {
        // Create modal for screenshot viewing
        const modal = document.createElement('div');
        modal.id = 'screenshotModal';
        modal.style.cssText = `
            display: block;
            position: fixed;
            z-index: 2000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.8);
        `;
        
        modal.innerHTML = `
            <div style="
                background-color: white;
                margin: 5% auto;
                padding: 30px;
                border-radius: 15px;
                width: 90%;
                max-width: 800px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #667eea;">📸 Bukti Screenshot Pertandingan</h2>
                    <span onclick="closeScreenshotModal()" style="
                        color: #aaa;
                        font-size: 28px;
                        font-weight: bold;
                        cursor: pointer;
                        line-height: 1;
                    ">&times;</span>
                </div>
                <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                    <h3 style="margin: 0 0 10px 0; color: #4caf50;">${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}</h3>
                    <p style="margin: 5px 0; color: #666;"><strong>Tanggal:</strong> ${new Date(match.date + 'T' + match.time).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    <p style="margin: 5px 0; color: #666;"><strong>File:</strong> ${match.screenshotName || 'screenshot.jpg'}</p>
                    ${match.notes ? `<p style="margin: 5px 0; color: #666;"><strong>Catatan:</strong> ${match.notes}</p>` : ''}
                </div>
                <div style="text-align: center;">
                    <img src="${match.screenshotData}" alt="Screenshot Bukti" style="
                        max-width: 100%;
                        max-height: 60vh;
                        border-radius: 8px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    ">
                </div>
                <div style="margin-top: 20px; text-align: center;">
                    <button onclick="closeScreenshotModal()" style="
                        background: linear-gradient(45deg, #667eea, #764ba2);
                        color: white;
                        border: none;
                        padding: 12px 25px;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                    ">🚪 Tutup</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close modal when clicking outside
        modal.onclick = function(event) {
            if (event.target === modal) {
                closeScreenshotModal();
            }
        }
    }
}

// Close screenshot modal
function closeScreenshotModal() {
    const modal = document.getElementById('screenshotModal');
    if (modal) {
        modal.remove();
    }
}

// View screenshot for pending result
function viewPendingScreenshot(resultId) {
    const result = pendingResults.find(r => r.id === resultId);
    if (result && (result.screenshot || result.screenshotData)) {
        // Check if we have base64 data already
        if (result.screenshotData) {
            // Display the screenshot directly using base64 data
            showScreenshotModal(result, result.screenshotData);
        } else if (result.screenshot && result.screenshot instanceof File) {
            // Convert file to base64 for display
            const reader = new FileReader();
            reader.onload = function(e) {
                showScreenshotModal(result, e.target.result);
            };
            reader.readAsDataURL(result.screenshot);
        }
    }
}

// Helper function to create and show screenshot modal
function showScreenshotModal(result, screenshotSrc) {
    // Create modal for screenshot viewing
    const modal = document.createElement('div');
    modal.id = 'screenshotModal';
    modal.style.cssText = `
        display: block;
        position: fixed;
        z-index: 2000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0,0,0,0.8);
    `;
    
    // Get match details for context
    const match = matches.find(m => m.id == result.matchId);
    
    modal.innerHTML = `
        <div style="
            background-color: white;
            margin: 5% auto;
            padding: 30px;
            border-radius: 15px;
            width: 90%;
            max-width: 800px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #667eea;">📸 Bukti Screenshot - Pending Approval</h2>
                <span onclick="closeScreenshotModal()" style="
                    color: #aaa;
                    font-size: 28px;
                    font-weight: bold;
                    cursor: pointer;
                    line-height: 1;
                ">&times;</span>
            </div>
            <div style="margin-bottom: 20px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                <h3 style="margin: 0 0 10px 0; color: #856404;">${result.homeTeam} ${result.homeScore} - ${result.awayScore} ${result.awayTeam}</h3>
                <p style="margin: 5px 0; color: #666;"><strong>Dikirim pada:</strong> ${result.submittedAt}</p>
                <p style="margin: 5px 0; color: #666;"><strong>File:</strong> ${result.screenshotName || (result.screenshot && result.screenshot.name) || 'screenshot.jpg'}</p>
                ${result.notes ? `<p style="margin: 5px 0; color: #666;"><strong>Catatan:</strong> ${result.notes}</p>` : ''}
                <div style="margin-top: 10px; padding: 8px; background: rgba(255, 193, 7, 0.1); border-radius: 4px;">
                    <small style="color: #856404;"><strong>⚠️ Status:</strong> Menunggu approval admin</small>
                </div>
            </div>
            <div style="text-align: center;">
                <img src="${screenshotSrc}" alt="Screenshot Bukti" style="
                    max-width: 100%;
                    max-height: 60vh;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                ">
            </div>
            <div style="margin-top: 20px; text-align: center; display: flex; gap: 10px; justify-content: center;">
                ${isAdminRole() ? `
                <button onclick="approveResult(${result.id}); closeScreenshotModal();" style="
                    background: linear-gradient(45deg, #4caf50, #45a049);
                    color: white;
                    border: none;
                    padding: 12px 25px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                ">✅ Setujui Hasil</button>
                <button onclick="rejectResult(${result.id}); closeScreenshotModal();" style="
                    background: linear-gradient(45deg, #f44336, #d32f2f);
                    color: white;
                    border: none;
                    padding: 12px 25px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                ">❌ Tolak Hasil</button>
                ` : ''}
                <button onclick="closeScreenshotModal()" style="
                    background: linear-gradient(45deg, #667eea, #764ba2);
                    color: white;
                    border: none;
                    padding: 12px 25px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                ">🚪 Tutup</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close modal when clicking outside
    modal.onclick = function(event) {
        if (event.target === modal) {
            closeScreenshotModal();
        }
    }
}





// Generate full season schedule
async function generateFullSchedule() {
    const startDate = document.getElementById('season-start').value;
    const matchesPerDay = parseInt(document.getElementById('matches-per-day').value);
    const intervalDays = parseInt(document.getElementById('matchday-interval').value);
    const matchTime = document.getElementById('match-time-auto').value;

    if (!startDate || !matchTime) {
        alert('⚠️ Mohon isi tanggal mulai dan waktu pertandingan!');
        return;
    }

    // Load teams from database first and wait for completion
    console.log('Loading teams for schedule generation...');
    const loadedTeams = await loadTeamOptions();
    
    console.log('Teams loaded:', loadedTeams.length, 'teams:', loadedTeams.map(t => t.name));
    
    if (!loadedTeams || loadedTeams.length < 2) {
        alert(`⚠️ Minimal 2 tim diperlukan untuk membuat jadwal liga! Saat ini ada ${loadedTeams ? loadedTeams.length : 0} tim.`);
        return;
    }

    // Clear existing matches from database first
    try {
        console.log('Clearing existing matches from database...');
        const response = await fetch('/api/matches');
        if (response.ok) {
            const existingMatches = await response.json();
            
            // Delete each existing match sequentially to avoid race conditions
            for (const match of existingMatches) {
                try {
                    await fetch(`/api/matches/${match.id}`, { method: 'DELETE' });
                    console.log(`Deleted existing match ${match.id}`);
                } catch (error) {
                    console.log(`Failed to delete match ${match.id}:`, error.message);
                }
            }
            
            console.log(`Deleted ${existingMatches.length} existing matches`);
        }
    } catch (error) {
        console.log('API not available for clearing, will clear localStorage');
    }
    
    // Clear existing matches
    matches = [];
    currentMatchdayIndex = 0;
    localStorage.setItem('matches', JSON.stringify([]));
    
    // Use the loaded teams for schedule generation
    const teamList = [...loadedTeams];
    const totalTeams = teamList.length;
    
    let matchId = 1;
    let currentMatchday = 1;
    let matchesInCurrentDay = 0;
    let currentDate = new Date(startDate);
    
    console.log(`Generating double round-robin schedule for ${totalTeams} teams`);

    // Create all matches for double round-robin
    const allMatches = [];
    
    // Double round-robin - each team plays every other team twice (home and away)
    for (let homeTeamIndex = 0; homeTeamIndex < totalTeams; homeTeamIndex++) {
        for (let awayTeamIndex = 0; awayTeamIndex < totalTeams; awayTeamIndex++) {
            // Skip if same team
            if (homeTeamIndex === awayTeamIndex) continue;
            
            const homeTeam = teamList[homeTeamIndex].name;
            const awayTeam = teamList[awayTeamIndex].name;

            allMatches.push({
                homeTeam: homeTeam,
                awayTeam: awayTeam
            });
        }
    }

    console.log(`Total matches to schedule: ${allMatches.length}`);
    console.log('Matches that will be created:');
    allMatches.forEach((match, index) => {
        console.log(`  ${index + 1}. ${match.homeTeam} vs ${match.awayTeam}`);
    });

    // Save all matches to database
    try {
        console.log('Saving matches to database...');
        
        // Reset for match distribution
        let matchId = 1;
        let currentMatchday = 1;
        let matchesInCurrentDay = 0;
        let currentMatchDate = new Date(startDate);
        
        // Save each match to the database sequentially to avoid race conditions
        let savedCount = 0;
        
        for (let i = 0; i < allMatches.length; i++) {
            const match = allMatches[i];
            
            const matchData = {
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                date: currentMatchDate.toISOString().split('T')[0],
                time: matchTime,
                status: 'scheduled',
                matchday: currentMatchday
            };
            
            console.log(`Saving match ${i + 1}/${allMatches.length}: ${match.homeTeam} vs ${match.awayTeam} (Matchday ${currentMatchday})`);
            
            try {
                const response = await fetch('/api/matches', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(matchData)
                });
                
                if (response.ok) {
                    savedCount++;
                    console.log(`✅ Match ${i + 1} saved successfully`);
                } else {
                    console.error(`❌ Failed to save match ${i + 1}:`, response.statusText);
                }
            } catch (error) {
                console.error(`❌ Error saving match ${i + 1}:`, error.message);
            }
            
            matchesInCurrentDay++;
            
            // Move to next matchday if limit reached
            if (matchesInCurrentDay >= matchesPerDay) {
                currentMatchday++;
                matchesInCurrentDay = 0;
                // Advance date for next matchday
                currentMatchDate = new Date(currentMatchDate.getTime() + (intervalDays * 24 * 60 * 60 * 1000));
            }
        }
        
        console.log(`All matches processed. Successfully saved: ${savedCount}/${allMatches.length}`);
        
        // Reload matches from database to get proper IDs and update global matches array
        await loadMatches();
        
        // Verify the matches were saved correctly
        const verifyResponse = await fetch('/api/matches');
        const savedMatches = await verifyResponse.json();
        console.log(`Verification: ${savedMatches.length} matches found in database after save`);
        
        if (savedMatches.length !== allMatches.length) {
            console.warn(`⚠️ Expected ${allMatches.length} matches but found ${savedMatches.length} in database`);
        }
        
    } catch (error) {
        console.log('API not available, saving to localStorage only');
        // Fallback: save to localStorage with proper structure
        matches = [];
        let matchId = 1;
        let currentMatchday = 1;
        let matchesInCurrentDay = 0;
        let currentMatchDate = new Date(startDate);
        
        for (let i = 0; i < allMatches.length; i++) {
            const match = allMatches[i];
            
            matches.push({
                id: matchId++,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                date: currentMatchDate.toISOString().split('T')[0],
                time: matchTime,
                status: 'scheduled',
                matchday: currentMatchday
            });
            
            matchesInCurrentDay++;
            
            if (matchesInCurrentDay >= matchesPerDay) {
                currentMatchday++;
                matchesInCurrentDay = 0;
                currentMatchDate = new Date(currentMatchDate.getTime() + (intervalDays * 24 * 60 * 60 * 1000));
            }
        }
        
        localStorage.setItem('matches', JSON.stringify(matches));
    }

    // Calculate final matchdays (add 1 if there are remaining matches in the last incomplete matchday)
    const finalMatchdays = matchesInCurrentDay > 0 ? currentMatchday : currentMatchday - 1;

    // Show success message
    const totalMatches = matches.length;
    const expectedMatches = totalTeams * (totalTeams - 1); // Each team plays every other team twice (double round-robin)
    
    console.log(`Generated ${totalMatches} matches, expected ${expectedMatches}, across ${finalMatchdays} matchdays`);
    
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-success';
    alertDiv.innerHTML = `🎯 Jadwal liga berhasil dibuat!<br>
        <strong>Total:</strong> ${totalMatches} pertandingan (target: ${expectedMatches})<br>
        <strong>Matchdays:</strong> ${finalMatchdays} matchday<br>
        <strong>Format:</strong> ${matchesPerDay} pertandingan per matchday, interval ${intervalDays} hari<br>
        <strong>Tim:</strong> ${totalTeams} tim, setiap tim bermain ${(totalTeams - 1) * 2} pertandingan<br>
        <strong>Periode:</strong> ${new Date(startDate).toLocaleDateString('id-ID')} - ${new Date(currentDate.getTime() - (intervalDays * 24 * 60 * 60 * 1000)).toLocaleDateString('id-ID')}`;
    document.getElementById('admin').insertBefore(alertDiv, document.getElementById('admin').firstChild);
    setTimeout(() => alertDiv.remove(), 10000);

    // Refresh displays
    loadMatches();
    loadMatchOptions();
    
    console.log('Schedule generation completed:', matches);
}

// Clear all matches
async function clearAllMatches() {
    if (confirm('🗑️ Apakah Anda yakin ingin menghapus semua jadwal pertandingan?')) {
        console.log('Starting clearAllMatches function...');
        
        // Show loading message
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'alert';
        loadingDiv.style.background = '#fff3cd';
        loadingDiv.style.border = '1px solid #ffeaa7';
        loadingDiv.style.color = '#856404';
        loadingDiv.innerHTML = '⏳ Menghapus semua jadwal pertandingan...';
        document.getElementById('admin').insertBefore(loadingDiv, document.getElementById('admin').firstChild);
        
        try {
            // Try to clear all matches from database using a more robust approach
            console.log('Clearing all matches from database...');
            
            // Instead of deleting one by one, we'll clear the entire matches array
            // This prevents race conditions and ensures complete clearing
            const response = await fetch('/api/matches');
            if (response.ok) {
                const currentMatches = await response.json();
                console.log(`Found ${currentMatches.length} matches to clear`);
                
                if (currentMatches.length === 0) {
                    loadingDiv.remove();
                    const alertDiv = document.createElement('div');
                    alertDiv.className = 'alert';
                    alertDiv.style.background = '#d1ecf1';
                    alertDiv.style.border = '1px solid #bee5eb';
                    alertDiv.style.color = '#0c5460';
                    alertDiv.innerHTML = 'ℹ️ Tidak ada jadwal pertandingan untuk dihapus.';
                    document.getElementById('admin').insertBefore(alertDiv, document.getElementById('admin').firstChild);
                    setTimeout(() => alertDiv.remove(), 3000);
                    return;
                }
                
                // Clear matches by deleting them sequentially to avoid race conditions
                let deletedCount = 0;
                for (const match of currentMatches) {
                    try {
                        const deleteResponse = await fetch(`/api/matches/${match.id}`, { method: 'DELETE' });
                        if (deleteResponse.ok) {
                            deletedCount++;
                            console.log(`Deleted match ${match.id} (${deletedCount}/${currentMatches.length})`);
                        } else {
                            console.log(`Failed to delete match ${match.id}: ${deleteResponse.status}`);
                        }
                    } catch (error) {
                        console.log(`Failed to delete match ${match.id}:`, error.message);
                    }
                }
                
                console.log(`Successfully deleted ${deletedCount} out of ${currentMatches.length} matches`);
                
                // Verify all matches are cleared
                const verifyResponse = await fetch('/api/matches');
                const remainingMatches = await verifyResponse.json();
                console.log(`Remaining matches after clearing: ${remainingMatches.length}`);
                
                if (remainingMatches.length > 0) {
                    console.log('Some matches still remain, clearing them...');
                    // If any matches remain, try once more
                    for (const match of remainingMatches) {
                        await fetch(`/api/matches/${match.id}`, { method: 'DELETE' });
                    }
                }
            }
        } catch (error) {
            console.log('API not available, clearing localStorage only:', error.message);
        }
        
        // Remove loading message
        loadingDiv.remove();
        
        // Clear local arrays and localStorage
        matches = [];
        pendingResults = [];
        localStorage.setItem('matches', JSON.stringify([]));
        localStorage.setItem('pendingResults', JSON.stringify([]));
        
        // Load teams and reset team statistics
        try {
            await loadTeamOptions();
            
            // Reset team statistics
            if (teams && teams.length > 0) {
                teams.forEach(team => {
                    team.played = 0;
                    team.won = 0;
                    team.drawn = 0;
                    team.lost = 0;
                    team.goalsFor = 0;
                    team.goalsAgainst = 0;
                });
                
                // Save reset statistics to database
                try {
                    console.log('Resetting team statistics in database...');
                    
                    // Proses setiap tim satu per satu untuk memastikan semua tim diperbarui dengan benar
                    for (const team of teams) {
                        console.log(`Resetting stats for team ${team.name} (ID: ${team.id}):`, team);
                        try {
                            const response = await fetch(`/api/teams/${team.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(team)
                            });
                            
                            if (response.ok) {
                                const updatedTeam = await response.json();
                                console.log(`✅ Team ${team.name} stats reset successfully:`, updatedTeam);
                            } else {
                                console.error(`❌ Failed to reset stats for team ${team.name}:`, response.status, await response.text());
                            }
                        } catch (teamError) {
                            console.error(`❌ Error resetting stats for team ${team.name}:`, teamError);
                        }
                        
                        // Tambahkan jeda kecil antara permintaan untuk menghindari race condition
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    
                    // Verifikasi team stats were reset by reloading from API
                    console.log('Verifying team stats were reset by reloading from API...');
                    const verifyResponse = await fetch('/api/teams');
                    if (verifyResponse.ok) {
                        const verifiedTeams = await verifyResponse.json();
                        teams = verifiedTeams; // Update global teams array
                        console.log('Teams reloaded after reset, verifying stats:');
                        verifiedTeams.forEach(team => {
                            console.log(`${team.name}: played=${team.played}, won=${team.won}, drawn=${team.drawn}, lost=${team.lost}, goalsFor=${team.goalsFor}, goalsAgainst=${team.goalsAgainst}`);
                        });
                    } else {
                        console.error('Failed to verify team stats:', verifyResponse.status);
                    }
                    
                    console.log('Team statistics reset in database completed');
                } catch (error) {
                    console.log('API not available for team stats, updating localStorage', error);
                    localStorage.setItem('teams', JSON.stringify(teams));
                }
            }
        } catch (error) {
            console.log('Error loading teams for stats reset:', error.message);
        }

        // Show success message
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-success';
        alertDiv.innerHTML = '🗑️ Semua jadwal pertandingan berhasil dihapus dan statistik tim di-reset!';
        document.getElementById('admin').insertBefore(alertDiv, document.getElementById('admin').firstChild);
        setTimeout(() => alertDiv.remove(), 5000);

        // Refresh displays
        try {
            await loadMatches();
            loadMatchOptions();
            await loadStandings();
            loadPendingResults();
            console.log('All displays refreshed after clearing');
        } catch (error) {
            console.log('Error refreshing displays:', error.message);
        }
        
        console.log('clearAllMatches completed successfully');
    }
}

// Create new match
async function createMatch() {
    const homeTeam = document.getElementById('home-team-select').value;
    const awayTeam = document.getElementById('away-team-select').value;
    const matchDate = document.getElementById('match-date').value;
    const matchTime = document.getElementById('match-time').value;
    const matchdayNumber = parseInt(document.getElementById('matchday-number').value);

    if (homeTeam && awayTeam && matchDate && matchTime && homeTeam !== awayTeam && matchdayNumber) {
        const newMatch = {
            homeTeam: homeTeam,
            awayTeam: awayTeam,
            date: matchDate,
            time: matchTime,
            status: 'scheduled',
            matchday: matchdayNumber
        };

        try {
            // Save to database first
            const response = await fetch('/api/matches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newMatch)
            });
            
            if (response.ok) {
                console.log('Match saved to database successfully');
            }
        } catch (error) {
            console.log('API not available, saving to localStorage');
            // Fallback: add to local matches array
            const localMatch = {
                ...newMatch,
                id: matches.length > 0 ? Math.max(...matches.map(m => m.id)) + 1 : 1
            };
            matches.push(localMatch);
            localStorage.setItem('matches', JSON.stringify(matches));
        }
        
        // Reset form
        document.getElementById('home-team-select').value = '';
        document.getElementById('away-team-select').value = '';
        document.getElementById('match-date').value = '';
        document.getElementById('match-time').value = '';
        document.getElementById('matchday-number').value = '1';

        // Show success message
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-success';
        alertDiv.innerHTML = `✅ Pertandingan "${homeTeam} vs ${awayTeam}" berhasil dibuat untuk Matchday ${matchdayNumber}!`;
        document.getElementById('admin').insertBefore(alertDiv, document.getElementById('admin').firstChild);
        setTimeout(() => alertDiv.remove(), 3000);

        // Refresh displays
        await loadMatches();
        loadMatchOptions();
    } else {
        alert('⚠️ Mohon isi semua field dan pastikan tim berbeda!');
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    
    // Initialize event listeners
    initializeFileUpload();
    initializeResultForm();
    
    // Load initial data
    loadStandings();
    loadMatches();
    loadMatchOptions();
    loadTeamOptions();
    loadUsersList();
    loadTeamsSettingsList();
    
    console.log('App initialization completed');
});

// ========== USER MANAGEMENT FUNCTIONS ==========

// Global variable for editing user
let editingUserIndex = -1;

// Load users list for management
async function loadUsersList() {
    const container = document.getElementById('users-list');
    if (!container) return;
    
    try {
        let users = [];
        
        // Try to get users from API first
        try {
            const response = await fetch('/api/users');
            if (response.ok) {
                users = await response.json();
            }
        } catch (error) {
            console.log('API not available, using localStorage');
        }
        
        // Fallback to localStorage
        if (users.length === 0) {
            users = JSON.parse(localStorage.getItem('users') || '[]');
        }
        
        if (users.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Belum ada user. Tambahkan user baru di bawah.</p>';
            return;
        }
        
        container.innerHTML = '';
        users.forEach((user, index) => {
            const userCard = `
                <div class="team-item">
                    <div class="team-info">
                        <div class="team-name">${user.username}</div>
                        <div class="team-stats">
                            Role: ${user.role || 'user'} | Tim: ${user.teamName || 'Tidak ada'} | 
                            Dibuat: ${user.createdAt ? new Date(user.createdAt).toLocaleDateString('id-ID') : 'N/A'}
                        </div>
                    </div>
                    <div class="team-actions">
                        <button class="btn-edit" onclick="editUser(${index})">✏️ Edit</button>
                        <button class="btn-delete" onclick="deleteUser(${index})">🗑️ Hapus</button>
                    </div>
                </div>
            `;
            container.innerHTML += userCard;
        });
    } catch (error) {
        console.error('Error loading users:', error);
        container.innerHTML = '<p style="text-align: center; color: #dc3545; padding: 20px;">Error loading users</p>';
    }
}

// Add new user
async function addUser() {
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value.trim();
    const teamName = document.getElementById('new-user-team').value.trim();
    const role = document.getElementById('new-user-role').value;
    
    // Validation
    if (!username || !password || !teamName) {
        alert('⚠️ Mohon isi semua field!');
        return;
    }
    
    if (username.length < 3) {
        alert('⚠️ Username minimal 3 karakter!');
        return;
    }
    
    if (password.length < 6) {
        alert('⚠️ Password minimal 6 karakter!');
        return;
    }
    
    try {
        let users = [];
        let teams = [];
        
        // Get current users and teams
        try {
            const [usersResponse, teamsResponse] = await Promise.all([
                fetch('/api/users'),
                fetch('/api/teams')
            ]);
            
            if (usersResponse.ok) users = await usersResponse.json();
            if (teamsResponse.ok) teams = await teamsResponse.json();
        } catch (error) {
            // Fallback to localStorage
            users = JSON.parse(localStorage.getItem('users') || '[]');
            teams = JSON.parse(localStorage.getItem('teams') || '[]');
        }
        
        // Check if username already exists
        if (users.some(u => u.username === username)) {
            alert('⚠️ Username sudah ada!');
            return;
        }
        
        // Check if team name already exists
        if (teams.some(t => t.name === teamName)) {
            alert('⚠️ Nama tim sudah ada!');
            return;
        }
        
        const newUser = {
            username: username,
            password: password,
            teamName: teamName,
            role: role,
            createdAt: new Date().toISOString()
        };
        
        let userCreated = false;
        
        // Try API first
        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newUser)
            });
            
            if (response.ok) {
                const createdUser = await response.json();
                
                // Create team for the user
                const newTeam = {
                    name: teamName,
                    played: 0,
                    won: 0,
                    drawn: 0,
                    lost: 0,
                    goalsFor: 0,
                    goalsAgainst: 0,
                    owner: createdUser.id
                };
                
                const teamResponse = await fetch('/api/teams', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(newTeam)
                });
                
                if (teamResponse.ok) {
                    userCreated = true;
                } else {
                    throw new Error('Failed to create team');
                }
            }
        } catch (error) {
            console.log('API not available, using localStorage');
        }
        
        // Fallback to localStorage
        if (!userCreated) {
            const newUserId = Date.now();
            newUser.id = newUserId;
            users.push(newUser);
            localStorage.setItem('users', JSON.stringify(users));
            
            // Create team in localStorage
            const newTeam = {
                id: Date.now() + 1,
                name: teamName,
                played: 0,
                won: 0,
                drawn: 0,
                lost: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                owner: newUserId
            };
            teams.push(newTeam);
            localStorage.setItem('teams', JSON.stringify(teams));
        }
        
        // Clear form
        document.getElementById('new-username').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('new-user-team').value = '';
        document.getElementById('new-user-role').value = 'user';
        
        // Refresh displays
        await loadUsersList();
        loadTeamOptions();
        
        // Show success message
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-success';
        alertDiv.innerHTML = `✅ User "${username}" dengan tim "${teamName}" berhasil ditambahkan!`;
        document.getElementById('admin').insertBefore(alertDiv, document.getElementById('admin').firstChild);
        setTimeout(() => alertDiv.remove(), 3000);
        
    } catch (error) {
        console.error('Error adding user:', error);
        alert('⚠️ Gagal menambahkan user!');
    }
}

// Edit user function
async function editUser(index) {
    try {
        let users = [];
        
        // Get users from API or localStorage
        try {
            const response = await fetch('/api/users');
            if (response.ok) {
                users = await response.json();
            }
        } catch (error) {
            users = JSON.parse(localStorage.getItem('users') || '[]');
        }
        
        if (index >= users.length) return;
        
        editingUserIndex = index;
        const user = users[index];
        
        // Fill form with current data
        document.getElementById('edit-username').value = user.username;
        document.getElementById('edit-user-password').value = '';
        document.getElementById('edit-user-team').value = user.teamName || '';
        document.getElementById('edit-user-role').value = user.role || 'user';
        
        // Show modal
        document.getElementById('editUserModal').style.display = 'block';
        
    } catch (error) {
        console.error('Error editing user:', error);
        alert('⚠️ Gagal memuat data user!');
    }
}

// Save user edit
async function saveUserEdit() {
    if (editingUserIndex === -1) return;
    
    const newUsername = document.getElementById('edit-username').value.trim();
    const newPassword = document.getElementById('edit-user-password').value.trim();
    const newTeamName = document.getElementById('edit-user-team').value.trim();
    const newRole = document.getElementById('edit-user-role').value;
    
    // Validation
    if (!newUsername || !newTeamName) {
        alert('⚠️ Username dan nama tim tidak boleh kosong!');
        return;
    }
    
    if (newUsername.length < 3) {
        alert('⚠️ Username minimal 3 karakter!');
        return;
    }
    
    if (newPassword && newPassword.length < 6) {
        alert('⚠️ Password minimal 6 karakter!');
        return;
    }
    
    try {
        let users = [];
        let teams = [];
        
        // Get current data
        try {
            const [usersResponse, teamsResponse] = await Promise.all([
                fetch('/api/users'),
                fetch('/api/teams')
            ]);
            
            if (usersResponse.ok) users = await usersResponse.json();
            if (teamsResponse.ok) teams = await teamsResponse.json();
        } catch (error) {
            users = JSON.parse(localStorage.getItem('users') || '[]');
            teams = JSON.parse(localStorage.getItem('teams') || '[]');
        }
        
        if (editingUserIndex >= users.length) return;
        
        const currentUser = users[editingUserIndex];
        
        // Check if new username already exists (except current user)
        if (users.some((u, i) => u.username === newUsername && i !== editingUserIndex)) {
            alert('⚠️ Username sudah ada!');
            return;
        }
        
        // Check if new team name already exists (except current user's team)
        const currentUserTeam = teams.find(t => t.owner === currentUser.id);
        if (teams.some(t => t.name === newTeamName && t.id !== currentUserTeam?.id)) {
            alert('⚠️ Nama tim sudah ada!');
            return;
        }
        
        // Update user data
        const updatedUser = {
            ...currentUser,
            username: newUsername,
            teamName: newTeamName,
            role: newRole
        };
        
        // Update password if provided
        if (newPassword) {
            updatedUser.password = newPassword;
        }
        
        let updateSuccess = false;
        
        // Try API first
        try {
            const response = await fetch(`/api/users/${currentUser.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatedUser)
            });
            
            if (response.ok) {
                // Update team name if changed
                if (currentUserTeam && currentUserTeam.name !== newTeamName) {
                    const teamResponse = await fetch(`/api/teams/${currentUserTeam.id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            ...currentUserTeam,
                            name: newTeamName
                        })
                    });
                    
                    if (teamResponse.ok) {
                        updateSuccess = true;
                    }
                } else {
                    updateSuccess = true;
                }
            }
        } catch (error) {
            console.log('API not available, using localStorage');
        }
        
        // Fallback to localStorage
        if (!updateSuccess) {
            users[editingUserIndex] = updatedUser;
            localStorage.setItem('users', JSON.stringify(users));
            
            // Update team name in localStorage
            if (currentUserTeam && currentUserTeam.name !== newTeamName) {
                const teamIndex = teams.findIndex(t => t.id === currentUserTeam.id);
                if (teamIndex !== -1) {
                    teams[teamIndex].name = newTeamName;
                    localStorage.setItem('teams', JSON.stringify(teams));
                }
            }
        }
        
        // Close modal
        closeEditUserModal();
        
        // Refresh displays
        await loadUsersList();
        loadTeamOptions();
        
        // Show success message
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-success';
        alertDiv.innerHTML = `✅ User "${newUsername}" berhasil diperbarui!`;
        document.getElementById('admin').insertBefore(alertDiv, document.getElementById('admin').firstChild);
        setTimeout(() => alertDiv.remove(), 3000);
        
    } catch (error) {
        console.error('Error updating user:', error);
        alert('⚠️ Gagal memperbarui user!');
    }
}

// Delete user function
async function deleteUser(index) {
    try {
        let users = [];
        let teams = [];
        
        // Get current data
        try {
            const [usersResponse, teamsResponse] = await Promise.all([
                fetch('/api/users'),
                fetch('/api/teams')
            ]);
            
            if (usersResponse.ok) users = await usersResponse.json();
            if (teamsResponse.ok) teams = await teamsResponse.json();
        } catch (error) {
            users = JSON.parse(localStorage.getItem('users') || '[]');
            teams = JSON.parse(localStorage.getItem('teams') || '[]');
        }
        
        if (index >= users.length) return;
        
        const user = users[index];
        const username = user.username;
        
        // Don't allow deleting admin demo account
        if (user.username === 'admin') {
            alert('⚠️ Akun demo admin tidak dapat dihapus!');
            return;
        }
        
        // Allow deletion of user demo account with confirmation
        if (user.username === 'user') {
            if (!confirm('⚠️ Anda akan menghapus akun demo "user".\n\nApakah Anda yakin? Ini akan menghapus tim dan semua data terkait.')) {
                return;
            }
        } else {
            if (!confirm(`🗑️ Apakah Anda yakin ingin menghapus user "${user.username}"?\n\nTim dan semua data terkait akan ikut terhapus!`)) {
                return;
            }
        }
        
        const userTeam = teams.find(t => t.owner === user.id);
        
        let deleteSuccess = false;
        
        // Try API first
        try {
            // Delete user's team first
            if (userTeam) {
                await fetch(`/api/teams/${userTeam.id}`, {
                    method: 'DELETE'
                });
            }
            
            // Delete user
            const response = await fetch(`/api/users/${user.id}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                deleteSuccess = true;
            }
        } catch (error) {
            console.log('API not available, using localStorage');
        }
        
        // Fallback to localStorage
        if (!deleteSuccess) {
            // Remove user from array
            users.splice(index, 1);
            localStorage.setItem('users', JSON.stringify(users));
            
            // Remove user's team
            if (userTeam) {
                const teamIndex = teams.findIndex(t => t.id === userTeam.id);
                if (teamIndex !== -1) {
                    teams.splice(teamIndex, 1);
                    localStorage.setItem('teams', JSON.stringify(teams));
                    
                    // Remove matches involving this team
                    let matches = JSON.parse(localStorage.getItem('matches') || '[]');
                    matches = matches.filter(match => 
                        match.homeTeam !== userTeam.name && match.awayTeam !== userTeam.name
                    );
                    localStorage.setItem('matches', JSON.stringify(matches));
                    
                    // Remove pending results involving this team
                    let pendingResults = JSON.parse(localStorage.getItem('pendingResults') || '[]');
                    pendingResults = pendingResults.filter(result => 
                        result.homeTeam !== userTeam.name && result.awayTeam !== userTeam.name
                    );
                    localStorage.setItem('pendingResults', JSON.stringify(pendingResults));
                }
            }
        }
        
        // Refresh displays
        await loadUsersList();
        loadTeamOptions();
        loadStandings();
        loadMatches();
        loadMatchOptions();
        loadPendingResults();
        
        // Show success message
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-success';
        alertDiv.innerHTML = `🗑️ User "${username}" beserta tim dan data terkait berhasil dihapus!`;
        document.getElementById('admin').insertBefore(alertDiv, document.getElementById('admin').firstChild);
        setTimeout(() => alertDiv.remove(), 3000);
        
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('⚠️ Gagal menghapus user!');
    }
}

// Close edit user modal
function closeEditUserModal() {
    document.getElementById('editUserModal').style.display = 'none';
    editingUserIndex = -1;
}

// Update window.onclick to handle both modals
window.onclick = function(event) {
    const modal = document.getElementById('editTeamModal');
    const userModal = document.getElementById('editUserModal');
    const teamNameModal = document.getElementById('editTeamNameModal');
    if (event.target === modal) {
        closeEditModal();
    }
    if (event.target === userModal) {
        closeEditUserModal();
    }
    if (event.target === teamNameModal) {
        closeEditTeamNameModal();
    }
}

// ========== TEAM SETTINGS MANAGEMENT FUNCTIONS ==========

// Global variable for editing team
let editingTeamId = -1;

// Load teams list for settings management
async function loadTeamsSettingsList() {
    const container = document.getElementById('teams-settings-list');
    if (!container) return;
    
    try {
        let loadedTeams = [];
        
        // Try to get teams from API first
        try {
            const response = await fetch('/api/teams');
            if (response.ok) {
                loadedTeams = await response.json();
            }
        } catch (error) {
            console.log('API not available for teams, using localStorage');
            loadedTeams = JSON.parse(localStorage.getItem('teams') || '[]');
        }
        
        // Update global teams array
        teams = loadedTeams;
        
        if (teams.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666; background: #f8f9fa; border-radius: 10px; border: 2px dashed #ddd;">
                    <div style="font-size: 48px; margin-bottom: 15px;">⚽</div>
                    <h3 style="margin: 0 0 10px 0; color: #667eea;">Belum Ada Tim</h3>
                    <p style="margin: 0;">Tambahkan user untuk membuat tim secara otomatis</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        teams.forEach((team, index) => {
            const points = (team.won * 3) + (team.drawn * 1);
            const goalDiff = team.goalsFor - team.goalsAgainst;
            
            const teamCard = `
                <div class="team-item">
                    <div class="team-info">
                        <div class="team-name">${team.name}</div>
                        <div class="team-stats">
                            Main: ${team.played} | Menang: ${team.won} | Seri: ${team.drawn} | Kalah: ${team.lost} | 
                            Gol: ${team.goalsFor}-${team.goalsAgainst} | SG: ${goalDiff > 0 ? '+' + goalDiff : goalDiff} | 
                            Poin: ${points}
                        </div>
                    </div>
                    <div class="team-actions">
                        <button class="btn-edit" onclick="editTeamName(${team.id || index})">⚙️ Edit Nama</button>
                    </div>
                </div>
            `;
            container.innerHTML += teamCard;
        });
        
    } catch (error) {
        console.error('Error loading teams settings:', error);
        container.innerHTML = '<p style="text-align: center; color: #dc3545; padding: 20px;">Error loading teams settings</p>';
    }
}

// Edit team name function
async function editTeamName(teamId) {
    try {
        let loadedTeams = [];
        
        // Get teams from API or localStorage
        try {
            const response = await fetch('/api/teams');
            if (response.ok) {
                loadedTeams = await response.json();
            }
        } catch (error) {
            loadedTeams = JSON.parse(localStorage.getItem('teams') || '[]');
        }
        
        const team = loadedTeams.find(t => (t.id || teams.indexOf(t)) === teamId);
        
        if (!team) {
            alert('⚠️ Tim tidak ditemukan!');
            return;
        }
        
        editingTeamId = teamId;
        
        // Fill form with current data
        document.getElementById('edit-team-name-input').value = team.name;
        
        // Show modal
        document.getElementById('editTeamNameModal').style.display = 'block';
        
    } catch (error) {
        console.error('Error editing team:', error);
        alert('⚠️ Gagal memuat data tim!');
    }
}

// Save team name edit
async function saveTeamNameEdit() {
    if (editingTeamId === -1) return;
    
    const newTeamName = document.getElementById('edit-team-name-input').value.trim();
    
    // Validation
    if (!newTeamName) {
        alert('⚠️ Nama tim tidak boleh kosong!');
        return;
    }
    
    if (newTeamName.length < 2) {
        alert('⚠️ Nama tim minimal 2 karakter!');
        return;
    }
    
    try {
        let loadedTeams = [];
        let loadedUsers = [];
        
        // Get current data
        try {
            const [teamsResponse, usersResponse] = await Promise.all([
                fetch('/api/teams'),
                fetch('/api/users')
            ]);
            
            if (teamsResponse.ok) loadedTeams = await teamsResponse.json();
            if (usersResponse.ok) loadedUsers = await usersResponse.json();
        } catch (error) {
            loadedTeams = JSON.parse(localStorage.getItem('teams') || '[]');
            loadedUsers = JSON.parse(localStorage.getItem('users') || '[]');
        }
        
        // Find team to edit
        const teamIndex = loadedTeams.findIndex(t => (t.id || loadedTeams.indexOf(t)) === editingTeamId);
        
        if (teamIndex === -1) {
            alert('⚠️ Tim tidak ditemukan!');
            return;
        }
        
        const currentTeam = loadedTeams[teamIndex];
        
        // Check if new team name already exists (except current team)
        if (loadedTeams.some(t => t.name === newTeamName && (t.id || loadedTeams.indexOf(t)) !== editingTeamId)) {
            alert('⚠️ Nama tim sudah ada!');
            return;
        }
        
        // Update team name
        const updatedTeam = {
            ...currentTeam,
            name: newTeamName
        };
        
        let updateSuccess = false;
        
        // Try API first
        try {
            const response = await fetch(`/api/teams/${currentTeam.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatedTeam)
            });
            
            if (response.ok) {
                updateSuccess = true;
                
                // Update user's team name if they own this team
                const teamOwner = loadedUsers.find(u => u.id === currentTeam.owner);
                if (teamOwner && teamOwner.teamName !== newTeamName) {
                    const updatedUser = {
                        ...teamOwner,
                        teamName: newTeamName
                    };
                    
                    await fetch(`/api/users/${teamOwner.id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(updatedUser)
                    });
                }
            }
        } catch (error) {
            console.log('API not available, using localStorage');
        }
        
        // Fallback to localStorage
        if (!updateSuccess) {
            loadedTeams[teamIndex] = updatedTeam;
            localStorage.setItem('teams', JSON.stringify(loadedTeams));
            
            // Update user's team name in localStorage
            const teamOwner = loadedUsers.find(u => u.id === currentTeam.owner);
            if (teamOwner && teamOwner.teamName !== newTeamName) {
                const userIndex = loadedUsers.findIndex(u => u.id === currentTeam.owner);
                if (userIndex !== -1) {
                    loadedUsers[userIndex].teamName = newTeamName;
                    localStorage.setItem('users', JSON.stringify(loadedUsers));
                }
            }
        }
        
        // Close modal
        closeEditTeamNameModal();
        
        // Refresh displays
        await loadTeamsSettingsList();
        if (typeof loadUsersList === 'function') await loadUsersList();
        await loadStandings();
        loadTeamOptions();
        
        // Show success message
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-success';
        alertDiv.innerHTML = `✅ Nama tim berhasil diubah menjadi "${newTeamName}"!`;
        const adminSection = document.getElementById('admin');
        if (adminSection) {
            adminSection.insertBefore(alertDiv, adminSection.firstChild);
            setTimeout(() => alertDiv.remove(), 3000);
        }
        
    } catch (error) {
        console.error('Error updating team name:', error);
        alert('⚠️ Gagal memperbarui nama tim!');
    }
}

// Close edit team name modal
function closeEditTeamNameModal() {
    document.getElementById('editTeamNameModal').style.display = 'none';
    editingTeamId = -1;
}

// Load registration settings
async function loadRegistrationSettings() {
    try {
        let settings = {};
        
        // Try to get settings from API first
        try {
            const response = await fetch('/api/settings');
            if (response.ok) {
                settings = await response.json();
            }
        } catch (error) {
            console.log('API not available, using localStorage');
        }
        
        // Fallback to localStorage
        if (!settings.registrationToken) {
            settings = JSON.parse(localStorage.getItem('settings') || '{}');
            if (!settings.registrationToken) {
                settings = {
                    registrationToken: '123456',
                    allowRegistration: true
                };
            }
        }
        
        // Update UI
        document.getElementById('registration-token').value = settings.registrationToken || '123456';
        document.getElementById('allow-registration').value = settings.allowRegistration === false ? 'false' : 'true';
        
    } catch (error) {
        console.error('Error loading registration settings:', error);
    }
}

// Save registration settings
async function saveRegistrationSettings() {
    try {
        const registrationToken = document.getElementById('registration-token').value.trim();
        const allowRegistration = document.getElementById('allow-registration').value === 'true';
        
        if (!registrationToken) {
            alert('⚠️ Token registrasi tidak boleh kosong!');
            return;
        }
        
        const settings = {
            registrationToken,
            allowRegistration
        };
        
        let updateSuccess = false;
        
        // Try API first
        try {
            const response = await fetch('/api/settings/token', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });
            
            if (response.ok) {
                updateSuccess = true;
            }
        } catch (error) {
            console.log('API not available, using localStorage');
        }
        
        // Fallback to localStorage
        if (!updateSuccess) {
            localStorage.setItem('settings', JSON.stringify(settings));
        }
        
        // Show success message
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-success';
        alertDiv.innerHTML = `✅ Pengaturan token registrasi berhasil disimpan!`;
        const adminSection = document.getElementById('admin');
        if (adminSection) {
            adminSection.insertBefore(alertDiv, adminSection.firstChild);
            setTimeout(() => alertDiv.remove(), 3000);
        }
        
    } catch (error) {
        console.error('Error saving registration settings:', error);
        alert('⚠️ Gagal menyimpan pengaturan token registrasi!');
    }
}