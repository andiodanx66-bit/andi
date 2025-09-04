const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000; // Use environment port or fallback to 8000

// Middleware
app.use(cors());

// Configure server for large payloads - using only Express built-in parsers
// Increase payload size limit to handle large base64 images (80MB)
app.use(express.json({ limit: '80mb' }));
app.use(express.urlencoded({ limit: '80mb', extended: true }));

// Add request size logging middleware
app.use((req, res, next) => {
    if (req.headers['content-length']) {
        const sizeKB = parseInt(req.headers['content-length']) / 1024;
        if (sizeKB > 1024) { // Log requests larger than 1MB
            console.log(`Large request: ${req.method} ${req.url} - ${sizeKB.toFixed(2)}KB`);
        }
    }
    next();
});

app.use(express.static('.'));

// Database directory
const DB_DIR = './database';

// Ensure database directory exists
fs.ensureDirSync(DB_DIR);

// Helper function to read JSON file
const readJsonFile = async (filename) => {
    const filepath = path.join(DB_DIR, filename);
    try {
        const data = await fs.readJson(filepath);
        return data;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
};

// Helper function to write JSON file
const writeJsonFile = async (filename, data) => {
    const filepath = path.join(DB_DIR, filename);
    await fs.writeJson(filepath, data, { spaces: 2 });
};

// Teams endpoints
app.get('/api/teams', async (req, res) => {
    try {
        const teams = await readJsonFile('teams.json');
        res.json(teams);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/teams', async (req, res) => {
    try {
        const teams = await readJsonFile('teams.json');
        
        // Check if team name already exists
        const existingTeam = teams.find(t => t.name === req.body.name);
        if (existingTeam) {
            return res.status(400).json({ error: 'Nama tim sudah digunakan' });
        }
        
        const newTeam = { ...req.body, id: Date.now(), whatsapp: req.body.whatsapp || '' };
        teams.push(newTeam);
        await writeJsonFile('teams.json', teams);
        res.json(newTeam);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/teams/:id', async (req, res) => {
    try {
        const teams = await readJsonFile('teams.json');
        const teamIndex = teams.findIndex(t => t.id == req.params.id);
        if (teamIndex === -1) {
            return res.status(404).json({ error: 'Team not found' });
        }
        teams[teamIndex] = { ...teams[teamIndex], ...req.body };
        await writeJsonFile('teams.json', teams);
        res.json(teams[teamIndex]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/teams/:id', async (req, res) => {
    try {
        const teams = await readJsonFile('teams.json');
        const filteredTeams = teams.filter(t => t.id != req.params.id);
        await writeJsonFile('teams.json', filteredTeams);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Matches endpoints
app.get('/api/matches', async (req, res) => {
    try {
        const matches = await readJsonFile('matches.json');
        res.json(matches);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/matches', async (req, res) => {
    try {
        const matches = await readJsonFile('matches.json');
        const newMatch = { ...req.body, id: Date.now() };
        matches.push(newMatch);
        await writeJsonFile('matches.json', matches);
        res.json(newMatch);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/matches/:id', async (req, res) => {
    try {
        const matches = await readJsonFile('matches.json');
        const matchIndex = matches.findIndex(m => m.id == req.params.id);
        if (matchIndex === -1) {
            return res.status(404).json({ error: 'Match not found' });
        }
        matches[matchIndex] = { ...matches[matchIndex], ...req.body };
        await writeJsonFile('matches.json', matches);
        res.json(matches[matchIndex]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/matches/:id', async (req, res) => {
    try {
        const matches = await readJsonFile('matches.json');
        const filteredMatches = matches.filter(m => m.id != req.params.id);
        await writeJsonFile('matches.json', filteredMatches);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Pending results endpoints
app.get('/api/pending-results', async (req, res) => {
    try {
        const results = await readJsonFile('pending-results.json');
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/pending-results', async (req, res) => {
    try {
        const results = await readJsonFile('pending-results.json');
        
        // Log the size of the request for debugging
        const requestSizeKB = JSON.stringify(req.body).length / 1024;
        console.log(`Processing pending result upload: ${requestSizeKB.toFixed(2)}KB`);
        
        // Check if screenshot data exists and log its size
        if (req.body.screenshotData) {
            const imageSizeKB = req.body.screenshotData.length / 1024;
            console.log(`Screenshot data size: ${imageSizeKB.toFixed(2)}KB`);
        }
        
        const newResult = { ...req.body, id: Date.now() };
        results.push(newResult);
        await writeJsonFile('pending-results.json', results);
        
        console.log('Pending result saved successfully');
        res.json(newResult);
    } catch (error) {
        console.error('Error saving pending result:', error.message);
        
        // Handle specific payload size errors
        if (error.message.includes('PayloadTooLargeError') || error.message.includes('request entity too large')) {
            return res.status(413).json({ 
                error: 'File gambar terlalu besar. Maksimal 30MB.', 
                details: 'Coba kompres gambar atau gunakan format yang lebih efisien.' 
            });
        }
        
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/pending-results/:id', async (req, res) => {
    try {
        const results = await readJsonFile('pending-results.json');
        const index = results.findIndex(r => r.id == req.params.id);
        if (index === -1) {
            return res.status(404).json({ error: 'Pending result not found' });
        }

        // Merge updates; keep existing id
        results[index] = { ...results[index], ...req.body, id: results[index].id };
        await writeJsonFile('pending-results.json', results);
        res.json(results[index]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/pending-results/:id', async (req, res) => {
    try {
        const results = await readJsonFile('pending-results.json');
        const filteredResults = results.filter(r => r.id != req.params.id);
        await writeJsonFile('pending-results.json', filteredResults);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Users endpoints
app.get('/api/users', async (req, res) => {
    try {
        const users = await readJsonFile('users.json');
        // Remove password from response for security
        const safeUsers = users.map(user => {
            const { password, ...safeUser } = user;
            return safeUser;
        });
        res.json(safeUsers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const users = await readJsonFile('users.json');
        
        // Check if username already exists
        const existingUser = users.find(u => u.username === req.body.username);
        if (existingUser) {
            return res.status(400).json({ error: 'Username sudah digunakan' });
        }
        
        const newUser = { ...req.body, id: Date.now() };
        users.push(newUser);
        await writeJsonFile('users.json', users);
        
        // Remove password from response
        const { password, ...safeUser } = newUser;
        res.json(safeUser);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const users = await readJsonFile('users.json');
        const userIndex = users.findIndex(u => u.id == req.params.id);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }
        users[userIndex] = { ...users[userIndex], ...req.body };
        await writeJsonFile('users.json', users);
        
        // Remove password from response
        const { password, ...safeUser } = users[userIndex];
        res.json(safeUser);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const users = await readJsonFile('users.json');
        const userIndex = users.findIndex(u => u.id == req.params.id);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Don't allow deleting demo accounts
        const user = users[userIndex];
        if (user.username === 'admin') {
            return res.status(400).json({ error: 'Demo accounts cannot be deleted' });
        }
        
        // Allow deletion of "user" demo account but show warning
        if (user.username === 'user') {
            // We'll allow it but the frontend can show a warning
        }
        
        users.splice(userIndex, 1);
        await writeJsonFile('users.json', users);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = await readJsonFile('users.json');
        
        const user = users.find(u => u.username === username && u.password === password);
        if (!user) {
            return res.status(401).json({ error: 'Username atau password salah' });
        }
        
        // Remove password from response
        const { password: _, ...safeUser } = user;
        res.json(safeUser);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Settings endpoints
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await readJsonFile('settings.json');
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Validate registration token endpoint
app.post('/api/validate-token', async (req, res) => {
    try {
        const { token } = req.body;
        const settings = await readJsonFile('settings.json');
        
        // Check if registration is allowed and token is valid
        if (!settings.allowRegistration) {
            return res.status(403).json({ error: 'Pendaftaran akun saat ini ditutup' });
        }
        
        if (token !== settings.registrationToken) {
            return res.status(401).json({ error: 'Token registrasi tidak valid' });
        }
        
        res.json({ valid: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        // Ensure we have a registration token even if not provided
        if (!req.body.registrationToken) {
            const currentSettings = await readJsonFile('settings.json');
            req.body.registrationToken = currentSettings.registrationToken || '123456';
        }
        
        await writeJsonFile('settings.json', req.body);
        res.json(req.body);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update registration token endpoint
app.put('/api/settings/token', async (req, res) => {
    try {
        const { registrationToken } = req.body;
        if (!registrationToken) {
            return res.status(400).json({ error: 'Token registrasi diperlukan' });
        }
        
        const settings = await readJsonFile('settings.json');
        settings.registrationToken = registrationToken;
        await writeJsonFile('settings.json', settings);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        port: PORT,
        timestamp: new Date().toISOString() 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 E-Football Database Server running on port ${PORT}`);
    console.log(`📱 Access at: http://localhost:${PORT}`);
    console.log(`🌐 API endpoints available at: http://localhost:${PORT}/api/`);
    
    // Keep alive ping for Render (prevent sleeping)
    if (process.env.NODE_ENV === 'production') {
        const https = require('https');
        setInterval(() => {
            https.get(`https://${process.env.RENDER_EXTERNAL_HOSTNAME}`, (res) => {
                console.log('🔄 Keep-alive ping sent');
            }).on('error', (err) => {
                console.log('⚠️ Keep-alive ping failed:', err.message);
            });
        }, 14 * 60 * 1000); // Ping every 14 minutes
    }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Server shutting down gracefully...');
    process.exit(0);
});

module.exports = app;