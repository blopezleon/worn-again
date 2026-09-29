# Worn Again

A thrift outfit portfolio. Static site on GitHub Pages; outfits, photos and login live in Supabase (free tier).
Anyone can view. Only emails listed in the `owners` table can post, edit or delete.

## Setup (about 15 minutes)

### 1. Supabase project
1. Sign up at <https://supabase.com> and create a new project (any name, free plan, pick a region near you).
2. Open **SQL Editor → New query**, paste all of `supabase/setup.sql`, change `HER_EMAIL@example.com` to her real email, and press **Run**.
3. Open **Project Settings → API** (or the **Connect** button) and copy:
   - the **Project URL**
   - the **publishable** key (or the legacy **anon** key). Never use the `service_role` / secret key.
4. Paste both into `config.js`.

### 2. GitHub Pages
1. Push this folder to a GitHub repo.
2. Repo **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, folder `/ (root)`.
3. The site appears at `https://<username>.github.io/<repo>/` after a minute.

### 3. Login redirect
In Supabase **Authentication → URL Configuration**:
- **Site URL**: the GitHub Pages address from step 2 (with the trailing slash).
- **Redirect URLs**: add the same address. Add `http://localhost:8765/` too if you want to test locally.

### 4. First login
1. She opens the site and taps **Owner login** in the footer (or goes to `…/#studio`).
2. She enters her email, opens the link Supabase emails her **on the same device**, and lands back on the site logged in.
3. **Add a fit** and the settings gear appear. Posting works from her phone.

### 5. Lock the door
After she has logged in once: Supabase **Authentication → Sign In / Providers** (or **Settings**) → turn off
**Allow new users to sign up**. Nobody else could post anyway, but this stops strangers from creating accounts.

## Local testing
```
python3 -m http.server 8765
```
then open <http://localhost:8765/>.

## Files
- `index.html`: page shell
- `app.css`: all styles (colors and fonts are the tokens at the top)
- `app.js`: rendering, animations, the post/edit drawer, Supabase calls
- `config.js`: Supabase URL and public key
- `supabase/setup.sql`: tables, photo bucket and the owner-only rules
