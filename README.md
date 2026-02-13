# Gold & Silver Live Tracker

A real-time gold and silver price tracker built with **React** (frontend) and **Express** (backend). It fetches live precious metal prices from the [GoldPriceZ API](https://goldpricez.com) and displays them with currency and unit conversion.

## Features

- Live gold (XAU) and silver (XAG) prices
- Currency toggle: **INR (₹)** / **USD ($)**
- Unit conversion: **gram**, **troy ounce**, **kilogram**
- Price per 10 grams quick reference
- Auto-refresh every 60 seconds
- Responsive dark-themed UI

## Project Structure

```
gold-silver-tracker/
├── server.js            # Express backend – proxies GoldPriceZ API
├── package.json         # Root dependencies (Express, CORS, dotenv)
├── api/
│   └── index.js         # Vercel serverless entry point
├── vercel.json          # Vercel deployment configuration
└── client/
    ├── package.json     # React app dependencies & scripts
    ├── public/          # Static assets (index.html, icons)
    └── src/
        ├── App.js       # Main React component
        ├── App.css      # Styling
        └── index.js     # React entry point
```

## Prerequisites

- **Node.js** ≥ 18 (ships with built-in `fetch`)
- **npm** (comes with Node.js)
- A **GoldPriceZ API key** – sign up at <https://goldpricez.com/api> to get one

## Running Locally

### 1. Clone the repository

```bash
git clone https://github.com/Harihkvent/gold-silver-tracker.git
cd gold-silver-tracker
```

### 2. Install dependencies

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```
GOLDPRICEZ_API_KEY=your_api_key_here
PORT=4000
```

### 4. Start development servers

Open **two terminals**:

```bash
# Terminal 1 – Backend (runs on http://localhost:4000)
node server.js

# Terminal 2 – Frontend (runs on http://localhost:3000)
cd client
npm start
```

The React dev server proxies `/api` requests to `http://localhost:4000` automatically, so the app works out of the box.

### 5. Open in browser

Visit **http://localhost:3000** to see the live tracker.

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check – returns `{ "status": "ok" }` |
| `GET /api/rates?currency=usd` | Gold & silver prices in USD |
| `GET /api/rates?currency=inr` | Gold & silver prices in INR |

## Building for Production

```bash
cd client
npm run build
```

This creates an optimized production build in `client/build/`.

## Deploying to Vercel

This project is pre-configured for [Vercel](https://vercel.com) deployment. The `vercel.json` file routes API requests to a Node.js serverless function and serves the React build as static files.

### Step-by-step deployment

#### 1. Push to GitHub

Make sure your code is pushed to a GitHub repository.

#### 2. Import project on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (or sign up) with your GitHub account.
2. Click **"Add New…" → "Project"**.
3. Select your **gold-silver-tracker** repository and click **Import**.

#### 3. Configure project settings

On the import screen:

- **Framework Preset**: Select **Other** (the `vercel.json` handles configuration).
- **Root Directory**: Leave as `.` (the repository root).
- **Build and Output Settings**: Leave as defaults – `vercel.json` already specifies the build configuration.

#### 4. Add environment variables

In the **Environment Variables** section, add:

| Name | Value |
|---|---|
| `GOLDPRICEZ_API_KEY` | Your GoldPriceZ API key |

#### 5. Deploy

Click **Deploy**. Vercel will:

1. Install dependencies and build the React client (`client/` directory).
2. Deploy `api/index.js` as a serverless function handling `/api/*` routes.
3. Serve the React build for all other routes.

Once the build completes, your app will be live at `https://your-project.vercel.app`.

#### 6. Custom domain (optional)

In your Vercel project dashboard, go to **Settings → Domains** to add a custom domain.

### How it works on Vercel

- **Frontend**: The React app is built from `client/` and served as static files.
- **Backend**: The Express server (`server.js`) is wrapped by `api/index.js` and runs as a Vercel serverless function.
- **Routing**: `vercel.json` routes `/api/*` requests to the serverless function and everything else to the React app.
- Since both frontend and API share the same domain on Vercel, relative API URLs work without CORS issues.

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOLDPRICEZ_API_KEY` | Yes | – | API key for GoldPriceZ |
| `PORT` | No | `4000` | Backend server port (local dev only) |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin (local dev only) |
| `REACT_APP_API_BASE` | No | `""` (relative) | API base URL override for the React app |

## License

ISC