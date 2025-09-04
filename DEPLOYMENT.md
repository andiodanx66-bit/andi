# E-Football League Management System

## Deploy to Free Hosting

### Railway (Recommended)
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "Start a New Project"
4. Select "Deploy from GitHub repo"
5. Choose this repository
6. Railway will auto-detect Node.js and deploy

### Render
1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Click "New Web Service"
4. Connect your GitHub repository
5. Use these settings:
   - Build Command: `npm install`
   - Start Command: `npm start`

### Cyclic
1. Go to [cyclic.sh](https://cyclic.sh)
2. Sign up with GitHub
3. Click "Deploy"
4. Select your repository
5. Automatic deployment

## Environment Variables
No environment variables needed for basic deployment.

## Database
Uses file-based JSON storage that persists on the hosting platform.

## Access
Once deployed, you'll get a URL like:
- Railway: `https://your-app.railway.app`
- Render: `https://your-app.onrender.com`
- Cyclic: `https://your-app.cyclic.app`