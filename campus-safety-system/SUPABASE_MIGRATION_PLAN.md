# Supabase Migration Plan

## Overview
Migrate Campus Safety System from PHP/MySQL backend to direct Supabase integration (serverless architecture).

---

## Current Architecture
```
Frontend (HTML/CSS/JS)
       ↓
   PHP Backend (localhost:8000)
       ↓
   MySQL Database (localhost)
```

## Target Architecture
```
Frontend (HTML/CSS/JS)
       ↓
   Supabase JavaScript SDK
       ↓
   Supabase (PostgreSQL + Auth + Realtime)
```

---

## Step 1: Supabase Project Setup

### 1.1 Create Supabase Account & Project
- Go to https://supabase.com
- Create new project
- Note down:
  - **Project URL**: `https://xxxxx.supabase.co`
  - **Anon Public Key**: `eyJhbGci...` (safe for frontend)
  - **Service Role Key**: Keep secret (for admin operations only)

### 1.2 Create Database Tables

Run these SQL commands in Supabase SQL Editor:

```sql
-- Users table (extends Supabase Auth)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    roll_number TEXT UNIQUE NOT NULL,
    phone TEXT,
    user_type TEXT DEFAULT 'student' CHECK (user_type IN ('student', 'admin', 'security')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Complaints table
CREATE TABLE public.complaints (
    id BIGSERIAL PRIMARY KEY,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    complaint_type TEXT NOT NULL CHECK (complaint_type IN ('hostel', 'academic', 'infrastructure', 'safety', 'medical', 'other')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'rejected')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent', 'emergency')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Emergency alerts table
CREATE TABLE public.emergency_alerts (
    id BIGSERIAL PRIMARY KEY,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    location TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications table
CREATE TABLE public.notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
```

### 1.3 Set Up Row Level Security (RLS) Policies

```sql
-- Profiles: Users can read/update their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Complaints: Students see own, Admins see all
CREATE POLICY "Students can view own complaints" ON public.complaints
    FOR SELECT USING (
        auth.uid() = student_id OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_type = 'admin')
    );

CREATE POLICY "Students can create complaints" ON public.complaints
    FOR INSERT WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Admins can update complaints" ON public.complaints
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_type = 'admin')
    );

-- Emergency alerts: Students create, Admins/Security view all
CREATE POLICY "Students can create emergency alerts" ON public.emergency_alerts
    FOR INSERT WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Staff can view emergency alerts" ON public.emergency_alerts
    FOR SELECT USING (
        auth.uid() = student_id OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_type IN ('admin', 'security'))
    );

-- Notifications: Users see own only
CREATE POLICY "Users can view own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);
```

### 1.4 Create Database Functions (for triggers)

```sql
-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, roll_number, phone)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'roll_number',
        NEW.raw_user_meta_data->>'phone'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at on complaints
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER complaints_updated_at
    BEFORE UPDATE ON public.complaints
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
```

---

## Step 2: Frontend Changes

### 2.1 Add Supabase SDK

Create new file: `js/supabase-config.js`
```javascript
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

### 2.2 Files to Modify

| Current File | Changes Required |
|--------------|------------------|
| `js/auth.js` | Replace fetch calls with Supabase Auth |
| `js/dashboard.js` | Replace fetch calls with Supabase queries |
| `js/sos-landing.js` | Replace fetch calls with Supabase insert |
| `login.html` | Add Supabase SDK script |
| `signup.html` | Add Supabase SDK script |
| `dashboard.html` | Add Supabase SDK script |
| `sos-landing.html` | Add Supabase SDK script |

### 2.3 Authentication Changes

**Current (auth.js):**
```javascript
// Old: PHP session-based
const response = await fetch(`${API_BASE_URL}/api/login.php`, {
    method: 'POST',
    body: formData,
    credentials: 'include'
});
localStorage.setItem('user_id', data.user_id);
```

**New (with Supabase):**
```javascript
// New: Supabase Auth (JWT-based)
const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password
});
// User session automatically managed by Supabase
```

### 2.4 Data Fetching Changes

**Current (dashboard.js):**
```javascript
// Old: PHP API
const response = await fetch(`${API_BASE_URL}/api/get_complaints.php`, {
    credentials: 'include'
});
const data = await response.json();
```

**New (with Supabase):**
```javascript
// New: Direct Supabase query
const { data, error } = await supabase
    .from('complaints')
    .select('*')
    .order('created_at', { ascending: false });
```

### 2.5 Data Insert Changes

**Current (submit complaint):**
```javascript
// Old: FormData to PHP
const formData = new FormData();
formData.append('title', title);
const response = await fetch(`${API_BASE_URL}/api/submit_complaint.php`, {
    method: 'POST',
    body: formData
});
```

**New (with Supabase):**
```javascript
// New: Direct Supabase insert
const { data, error } = await supabase
    .from('complaints')
    .insert({
        student_id: user.id,
        title: title,
        complaint_type: type,
        description: description,
        location: location
    })
    .select();
```

---

## Step 3: File-by-File Migration Checklist

### 3.1 New Files to Create
- [ ] `js/supabase-config.js` - Supabase client initialization

### 3.2 Files to Modify

#### `js/auth.js`
- [ ] Remove `API_BASE_URL` constant
- [ ] Import Supabase client
- [ ] Replace login function:
  - [ ] Use `supabase.auth.signInWithPassword()`
  - [ ] Remove localStorage manual storage (Supabase handles session)
- [ ] Replace signup function:
  - [ ] Use `supabase.auth.signUp()` with metadata
  - [ ] Pass full_name, roll_number, phone in options.data
- [ ] Add logout function:
  - [ ] Use `supabase.auth.signOut()`

#### `js/dashboard.js`
- [ ] Remove `API_BASE` constant
- [ ] Import Supabase client
- [ ] Replace `checkAuth()`:
  - [ ] Use `supabase.auth.getUser()`
- [ ] Replace `fetchComplaints()`:
  - [ ] Use `supabase.from('complaints').select()`
- [ ] Replace `submitComplaint()`:
  - [ ] Use `supabase.from('complaints').insert()`
- [ ] Replace logout handler:
  - [ ] Use `supabase.auth.signOut()`
- [ ] Add real-time subscription (optional):
  - [ ] Use `supabase.channel().on().subscribe()`

#### `js/sos-landing.js`
- [ ] Import Supabase client
- [ ] Replace emergency trigger:
  - [ ] Insert into `emergency_alerts` table
  - [ ] Insert into `complaints` table with priority='emergency'
- [ ] Add notification creation for admins (via database function)

#### HTML Files (all)
- [ ] Add Supabase SDK via CDN or ES module import
- [ ] Update script tags to use type="module"

---

## Step 4: Backend Cleanup

### Files to DELETE (after migration complete)
```
backend/
├── api/
│   ├── add_comment.php      ❌ DELETE
│   ├── get_complaints.php   ❌ DELETE
│   ├── get_notifications.php ❌ DELETE
│   ├── login.php            ❌ DELETE
│   ├── signup.php           ❌ DELETE
│   ├── submit_complaint.php ❌ DELETE
│   ├── trigger_emergency.php ❌ DELETE
│   └── update_complaint_status.php ❌ DELETE
└── config/
    └── db_config.php        ❌ DELETE
```

---

## Step 5: Testing Checklist

### Authentication
- [ ] User can sign up with email/password
- [ ] User can log in
- [ ] User can log out
- [ ] Session persists on page refresh
- [ ] Unauthorized users redirected to login

### Complaints
- [ ] Student can submit complaint
- [ ] Student can view own complaints
- [ ] Admin can view all complaints
- [ ] Admin can update complaint status
- [ ] Complaints show correct timestamps

### Emergency SOS
- [ ] Student can trigger SOS
- [ ] Location captured correctly
- [ ] Alert created in database
- [ ] Admins notified (if notification system active)

### Security
- [ ] RLS policies working (students can't see others' data)
- [ ] Anon key can't bypass RLS
- [ ] No sensitive data exposed

---

## Step 6: Optional Enhancements (Post-Migration)

### Real-time Updates
```javascript
// Subscribe to new complaints (for admin dashboard)
supabase
    .channel('complaints')
    .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'complaints' },
        (payload) => {
            console.log('New complaint:', payload.new);
            // Update UI
        }
    )
    .subscribe();
```

### Password Reset
```javascript
await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://yoursite.com/reset-password'
});
```

### Email Verification
- Enable in Supabase Dashboard → Authentication → Settings
- Customize email templates

---

## Migration Timeline Estimate

| Phase | Task | Estimated Time |
|-------|------|----------------|
| 1 | Supabase project setup | 30 mins |
| 2 | Create tables + RLS policies | 1 hour |
| 3 | Modify auth.js | 1-2 hours |
| 4 | Modify dashboard.js | 1-2 hours |
| 5 | Modify sos-landing.js | 30 mins |
| 6 | Testing & debugging | 2-3 hours |
| 7 | Delete PHP backend | 10 mins |

**Total: ~6-8 hours**

---

## Required Supabase Credentials

After creating your Supabase project, you'll need:

```
SUPABASE_URL=https://xxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

These go in `js/supabase-config.js`

---

## Notes

1. **No backend server needed** - Frontend talks directly to Supabase
2. **Hosting** - Can use any static hosting (Vercel, Netlify, GitHub Pages)
3. **Security** - Row Level Security (RLS) protects data at database level
4. **Free tier** - Supabase free tier includes:
   - 500MB database
   - 50,000 monthly active users
   - Unlimited API requests
   - Real-time subscriptions
