# Rural Connect – One Platform for Rural Communities

Rural Connect is a college-project web platform for rural communities. It provides government schemes, complaint reporting, agriculture information, weather, market information, announcements, opportunities, notifications and user/admin dashboards.

## What was fixed

- Removed the broken MongoDB requirement and replaced it with a reliable local JSON datastore.
- Repaired authentication with bcrypt password hashing and JWT sessions.
- Registration now persists users; a newly registered user can immediately log in.
- Added protected user/admin API routes.
- Centralized the frontend API URL so localhost ports are not scattered through the project.
- Configured CORS for local development.
- Repaired notification routing and added notification read endpoints.
- Added local content data and CRUD API support for admin screens.
- Added a weather endpoint that works without an API key and can use OpenWeather when `OPENWEATHER_API_KEY` is configured.
- Backend serves the frontend, so the normal setup needs only one terminal.
- Added clear API/network error messages instead of silently switching to fake data.

## Requirements

- Node.js 18 or newer
- npm

No MongoDB, Firebase, Supabase, Atlas account or paid service is required.

## Run from a fresh folder

### Windows

1. Extract the ZIP.
2. Open a terminal inside the extracted `RuralConnect` folder.
3. Install backend dependencies:

```bash
npm install
```

4. Initialize/reset the local database with demo data:

```bash
npm run seed
```

5. Start the application:

```bash
npm start
```

6. Open:

**http://localhost:5000**

### Alternative: run directly from Backend

```bash
cd Backend
npm install
npm run seed
npm start
```

Then open **http://localhost:5000**.

## Demo accounts

**Admin**
- Email: `admin@ruralconnect.local`
- Password: `Admin@123`

**User**
- Email: `user@ruralconnect.local`
- Password: `User@123`

You can also create a new account from **Register**.

## Local database

The application stores its data in:

`Backend/data/rural-connect.json`

It is created automatically. Running `npm run seed` resets it to the supplied demo dataset.

Passwords are never stored as plain text; they are stored as salted PBKDF2-SHA256 hashes using Node's built-in crypto module.

## Optional weather API

Weather works without external configuration using a clearly labelled local fallback reading. For live OpenWeather data, copy `Backend/.env.example` to `Backend/.env` and set:

```env
OPENWEATHER_API_KEY=your_key_here
```

You may also change `PORT` and `JWT_SECRET`. Never commit a real secret/API key.

## Frontend development

The recommended way is to let the backend serve the frontend:

`http://localhost:5000`

If you use VS Code Live Server for the frontend on another port, `frontend/js/config.js` automatically sends API requests to:

`http://localhost:5000/api`

Therefore the backend must still be running.

## Main API

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET/PUT /api/users/me`
- `GET /api/schemes`
- `GET /api/announcements`
- `GET /api/alerts`
- `GET /api/agriculture`
- `GET /api/market`
- `GET /api/opportunities`
- `GET/POST /api/complaints`
- `GET/PUT /api/notifications`
- `GET /api/weather`
- Admin analytics/users/content endpoints are protected by JWT + admin role.

## Troubleshooting

If the browser says it cannot connect to the API:

1. Make sure `npm start` is still running.
2. Visit `http://localhost:5000/api/health`.
3. You should see JSON containing `"status":"ok"`.
4. Then refresh the Rural Connect page.

If you want to reset all local data, stop the server and run:

```bash
npm run seed
```

## Project structure

```text
RuralConnect/
├── frontend/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── dashboard/
│   ├── admin/
│   ├── css/
│   └── js/
├── Backend/
│   ├── server.js
│   ├── seed.js
│   ├── package.json
│   ├── .env.example
│   └── data/
├── package.json
└── README.md
```


## New: Multilingual Rural Connect AI

This version adds:
- English / Marathi / Hindi language selector across the frontend.
- Floating Rural Connect AI chatbot on frontend pages.
- `POST /api/chat` backend endpoint.
- Chatbot grounded in the existing schemes, agriculture, market, opportunities, announcements and alerts data.
- Optional OpenAI Responses API integration through backend only. The API key is never exposed in browser code.

### Run
1. Open a terminal in `Backend` and run `npm start`.
2. Open `http://localhost:5000/` in the browser.
3. Optional: copy `.env.example` values into `.env` and set `OPENAI_API_KEY` to enable AI-generated answers. Without a key, the chatbot still provides grounded answers from the local Rural Connect data.

### Important
Opening `index.html` directly with `file://` cannot start the Node backend. The multilingual UI works, but the backend chatbot needs the Node server running. For a complete demo, use `npm start` and open the local URL above.


## Fleet Management

The redesigned Rural Connect project now includes an admin-only Fleet Management module. It adds vehicle, driver, trip, maintenance and fuel-record collections/API support while preserving the existing authentication and application modules.

### Fleet routes
- `frontend/admin/fleet.html` — responsive fleet dashboard and vehicle management UI
- `GET/POST /api/vehicles` and `GET/PUT/DELETE /api/vehicles/:id`
- `GET/POST /api/drivers` and `GET/PUT/DELETE /api/drivers/:id`
- `GET/POST /api/trips` and `GET/PUT/DELETE /api/trips/:id`
- `GET/POST /api/maintenance` and `GET/PUT/DELETE /api/maintenance/:id`
- `GET/POST /api/fuelRecords` and `GET/PUT/DELETE /api/fuelRecords/:id`

All fleet endpoints require an authenticated admin account. The data file is automatically migrated with empty fleet collections when needed, so existing data is preserved.


## Fleet Management & Vehicle Booking

- Admins can add, edit, delete and update vehicle status.
- Users can see every vehicle and its current status.
- Only vehicles marked **Available** can be booked.
- A successful booking immediately changes the vehicle to **On Trip**, so other users can see that it is unavailable.
- Admins can mark the active booking **Completed** or **Cancelled**, returning the vehicle to **Available** when no other active booking exists.
- Fleet tables use contained horizontal scrolling on smaller screens so they do not push the full page outside the viewport.
