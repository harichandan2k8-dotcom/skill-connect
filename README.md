# Skill Connect

Skill Connect is a diploma final year project for connecting students with the right mentor based on skills, goals, and project needs.

## Main Features

- Student and mentor login
- Mentor directory with skill search
- Mentorship request system
- Request approval and rejection
- Session scheduling
- Progress task tracker
- Mentor-student chat
- Fresh account registration with no preloaded users

## First Use

Create accounts from the website:

- Use `Student Register` for student details, college, course, skills, and goal
- Use `Mentor Register` for workplace, experience, completed courses, credentials, skills, and availability
- After registration, log in with the email and password you created

## How To Run

Open `index.html` in any modern browser, or run it as a local live website:

```powershell
npm start
```

Then open:

```text
http://127.0.0.1:5173/
```

If PowerShell blocks npm on your laptop, use this command instead:

```powershell
npm.cmd start
```

Keep that terminal window open while you are using the website.

## Technologies Used

- HTML
- CSS
- JavaScript
- Supabase database support
- Browser localStorage fallback

## Supabase Database Setup

The app can store data in Supabase when you add your project keys.

1. Create a Supabase project at `https://supabase.com`.
2. Open Supabase SQL Editor.
3. Paste and run the SQL from `SUPABASE_SETUP.sql`.
4. Open `app.js`.
5. Replace these values at the top of the file:

```js
const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";
```

Use your Supabase Project URL and anon/public key from Project Settings > API.

If these values are not filled, the app will still work using browser localStorage.

## Project Modules

- Authentication module
- Mentor directory module
- Skill search module
- Mentorship request module
- Session scheduling module
- Progress tracking module
- Chat module
- Mentor verification module

## Future Scope

- Add a real database
- Add file upload for certificates and portfolios
- Add video meeting integration
- Add automatic mentor recommendation
- Add email notifications
