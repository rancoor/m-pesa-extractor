# Deploying to Vercel

## Prerequisites
1. A [Vercel](https://vercel.com) account
2. [Vercel CLI](https://vercel.com/docs/cli) installed (optional)

## Method 1: Deploy via GitHub (Recommended)

### Step 1: Push to GitHub
```bash
git add -A
git commit -m "feat: add Vercel deployment support with Neon database"
git push origin v3
```

### Step 2: Connect to Vercel
1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New Project"**
3. Import your GitHub repository: `rancoor/m-pesa-extractor`
4. Select the **v3** branch
5. Vercel will auto-detect the Node.js project

### Step 3: Set up Neon Database
1. Go to [Vercel Dashboard](https://vercel.com/dashboard) → Storage
2. Click **"Create Database"** → Select **"Neon Postgres"**
3. Choose a name (e.g., `mpesa-statements`)
4. Click **"Create"**
5. Vercel will automatically add the `DATABASE_URL` environment variable to your project

### Step 4: Deploy
1. Click **"Deploy"**
2. Wait for the build to complete (~2-3 minutes)
3. Your app will be live at `https://your-project.vercel.app`

---

## Method 2: Deploy via CLI

### Step 1: Install Vercel CLI
```bash
npm install -g vercel
```

### Step 2: Login
```bash
vercel login
```

### Step 3: Deploy
```bash
vercel --prod
```

### Step 4: Add Database
After deployment, add a Neon database:
1. Go to your project in Vercel Dashboard
2. Navigate to **Storage** → **Create Database**
3. Select **Neon Postgres**
4. The `DATABASE_URL` will be automatically added

### Step 5: Redeploy
```bash
vercel --prod
```

---

## Environment Variables

The app automatically detects if it's running on Vercel and switches from SQLite to Postgres.

Required environment variables on Vercel:
- `DATABASE_URL` - Automatically set when you create a Neon database

---

## Testing Locally with Postgres

If you want to test with Postgres locally:

1. Create a `.env` file (copy from `.env.example`)
2. Set `VERCEL=1` and add your `DATABASE_URL`
3. Install dependencies: `npm install`
4. Run: `npm start`

---

## Troubleshooting

### Database connection errors
- Make sure you've created a Neon database in Vercel
- Check that `DATABASE_URL` is set in environment variables

### Build failures
- Run `npm run build` locally first to ensure CSS builds correctly
- Check the Vercel deployment logs for specific errors

### History page not loading
- Check browser console for errors
- Verify database connection in Vercel logs

---

## Local Development

The app works locally with SQLite (no setup needed):
```bash
npm install
npm run build:css
npm start
```

Visit `http://localhost:3000`
