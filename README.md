# Breakfeast

A phone-first breakfast companion for the 15-breakfast trial in `plan15.md`. It suggests what to make, walks you through a kitchen check, sends anything missing to a shopping cart, and handles overnight prep.

Working on the code? Read `DEVELOPER_GUIDE.md` first.

## Setup

1. In MongoDB Atlas, create a free cluster, a database user, and allow network access (your IP for local dev; `0.0.0.0/0` for Netlify or another serverless host).
2. Copy the connection string (**Connect → Drivers**) into `.env.local` as `MONGODB_URI`. See `.env.example` for every variable.
3. `npm install`
4. Create the indexes, then your admin account (you'll be prompted for the password twice):

   ```sh
   npm run db:init
   npm run admin:create -- <your-admin-id>
   ```

5. `npm run dev`, sign in at http://localhost:3000/theadmin, and create user accounts there. Each user signs in at `/login` with their US mobile number and the password you give them.

## Accounts

- Only the admin creates users. User passwords are 4 to 6 characters (generated ones are exactly 6) so they can be read out over the phone; they are safe only because sign-in attempts are rate limited.
- Users can't change their own password. The admin resets it from the user's page, which signs the user out everywhere.
- Each user starts in a household of one. From the Household section on the Pantry page they can invite someone by mobile number; once accepted, the two share the pantry, cart, tomorrow's plan and breakfast history, while each keeps their own ratings. Leaving keeps a copy of everything. The admin can remove or move members from the user's Household tab.

## Monitoring

Sign-ins, sign-outs and app opens are recorded with the device, IP location and (when the person allows it) GPS location, and the app logs what people do (pages, taps, saves, errors; never what they type). The admin sees this on each user's Devices, Access history and Activity tabs, on **Live activity**, and on **Alerts**, which lists sign-ins flagged as possible account sharing (new device, two devices at once, far from the last location, and so on). There are no alert emails. Geolocation uses ip-api by default; see `GEOIP_PROVIDER` in `.env.example`.

## Admin CLI

| Command | What it does |
| --- | --- |
| `npm run db:init` | Create every index. Safe to rerun |
| `npm run admin:create -- <id>` | New admin; prompts for the password |
| `npm run admin:reset-password -- <id>` | New password; signs that admin out everywhere |
| `npm run admin:list` | Admin IDs, status, last login |
| `npm run admin:disable -- <id>` / `admin:enable -- <id>` | Block or restore an admin |
| `npm run db:reset-app-data -- --yes` | Delete all breakfast data (pantry, cart, plan, history, ratings) |

Add `--stdin` to read the password from standard input, or `--generate` to create and print a 12-character one. Passwords are never accepted as arguments.

## Deploying

Deploy to Netlify (or any Node host) and set `MONGODB_URI`, `MONGODB_DB`, `APP_ORIGIN` (the site's exact URL) and `CLIENT_IP_SOURCE=x-nf-client-connection-ip`. IP geolocation defaults to ip-api's free tier (non-commercial, HTTP); set `GEOIP_PROVIDER=ipinfo` and `GEOIP_TOKEN` for HTTPS, or `none` to turn it off. Run `npm run db:init` and `admin:create` once against the production database from your machine.
