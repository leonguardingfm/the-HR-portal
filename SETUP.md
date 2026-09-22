# Running the portal on your own machine

Everything below is typed into a **terminal on your own computer**, inside the project folder.
Nothing runs on GitHub, and nothing runs in a chat window.

If you have never used a terminal: on **Windows** press Start, type `PowerShell`, open it. On **Mac**
press Cmd+Space, type `Terminal`, open it.

---

## Step 1 — install three things (once)

| | What | Where | Check it worked |
|---|------|-------|-----------------|
| 1 | **Node.js**, version 20 or newer | <https://nodejs.org> — take the "LTS" button | `node --version` → `v20.` or higher |
| 2 | **PostgreSQL 16** | <https://www.postgresql.org/download/> | `psql --version` → `psql (PostgreSQL) 16.` |
| 3 | **Git** | <https://git-scm.com/downloads> | `git --version` → any number |

When PostgreSQL installs it asks you to set a **password for the `postgres` user**. Write it down —
you need it in step 4.

Close and reopen the terminal after installing, or the checks above will say "not recognised".

## Step 2 — get the code

```bash
git clone https://github.com/leonguardingfm/the-HR-portal.git
cd the-HR-portal
git checkout claude/vibrant-einstein-r1vzl8
```

The third line matters: the work is on that branch, not on `main`.

Everything from here on is run **inside this folder**. If you close the terminal and come back,
`cd` into it again first.

## Step 3 — install the project's own dependencies

```bash
npm install
```

A few thousand files land in a `node_modules` folder. Takes a minute or two. Warnings are normal;
errors are not.

## Step 4 — create the database

Create an empty database called `leon`:

```bash
createdb -U postgres leon
```

If `createdb` is not recognised on Windows, use this instead:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres leon
```

Then tell the app where it is. Copy the example file:

```bash
# Mac / Linux
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Open `.env` in Notepad or any editor and put your password in, and a secret of your own:

```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/leon"
AUTH_SECRET="any-long-random-string-at-least-16-characters"
```

`AUTH_SECRET` signs the session cookie. Any long random string will do for now; it must be
set, and the app refuses to start in production without it.

## Step 5 — build the tables and put data in

```bash
npm run db:migrate
npm run db:seed
```

- `db:migrate` creates the tables and the rules that protect them.
- `db:seed` fills it with the configuration (document types, form definitions, retention rules) and
  the demonstration records.

You should see a table of counts: 29 people, 16 shifts, 136 screening checks, and so on.

## Step 6 — start it

```bash
npm run dev
```

Leave that terminal open — it is the server. Open a browser at:

**<http://localhost:3000>**

You will land on a sign-in page listing the seeded users. Pick one, choose the role you want
to work as, and sign in. The **Control** desk opens on the live board; the **Higher Management** user holds
Higher Management, HR Manager and Screening Administrator, so you can switch between them from
the top bar and watch the surface change.

> **The sign-in is not authentication yet.** It checks the person exists and holds the role;
> it proves nothing about who is at the keyboard. That is why `npm run start` (production mode)
> refuses it: company sign-on replaces it, and nothing else changes when it does. For now, use
> `npm run dev`.

To stop it, click the terminal and press `Ctrl+C`.

---

## The other commands, and when you would use them

These are not part of setup. You will not normally need them.

| Command | What it does | When |
|---------|--------------|------|
| `npm run build` | Builds the production version | Before deploying it to a server |
| `npm run typecheck` | Checks the code for type errors | After changing code |
| `npm run db:reset` | **Wipes the database**, rebuilds it, re-seeds | When the demo data gets messy |
| `npm run db:test` | Creates a throwaway database and proves the safety rules work — 81 checks | To satisfy yourself the compliance rules are real |
| `npm run test` | Everything above: types, the role and approval rules, and the database rules | Before pushing anything |
| `npm run db:validate` | Checks the database design is valid | After changing the schema |

The `psql ... UPDATE ...` commands mentioned in conversation were **me proving the screens react to
real data**. You do not need to run those.

---

## When something goes wrong

| It says | What it means | Fix |
|---------|---------------|-----|
| `'npm' is not recognized` | Node.js is not installed, or the terminal was open before you installed it | Close and reopen the terminal. If it persists, reinstall Node.js |
| `Can't reach database server at localhost:5432` | PostgreSQL is not running | **Windows:** Start → Services → find `postgresql-x64-16` → Start. **Mac:** `brew services start postgresql@16` |
| `password authentication failed for user "postgres"` | Wrong password in `.env` | Check the password you set when installing PostgreSQL |
| `database "leon" does not exist` | Step 4 was skipped or failed | Run the `createdb` line again |
| `Port 3000 is already in use` | It is already running in another terminal | Use that one, or close it and start again |
| The page loads but is empty | The seed did not run | `npm run db:seed` |

---

## Worth knowing

**The data is invented.** Every officer, site, shift and screening file was made up to make the
screens reviewable. Nothing is connected to Casper, the SIA register, Creditsafe or email.

**This runs only on your machine.** Nobody else can reach `localhost:3000` — not colleagues, not
your phone. Putting it somewhere the team can use needs hosting, and hosting needs the availability
question (decision **E2**) answered first: what happens when it is down on a Friday night.

**Four screens read the database:** Dashboard, Live board, Scheduling, Compliance. The rest still
show demonstration data held in the code. That is the next piece of work.
