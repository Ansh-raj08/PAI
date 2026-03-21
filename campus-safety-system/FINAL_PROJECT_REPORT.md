# Campus Safety System - Final Project Report

**Project**: Campus Safety System
**Backend**: Supabase (PostgreSQL + Auth + Realtime)
**Frontend**: Vanilla HTML/CSS/JavaScript (ES6 Modules)
**Date**: March 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Project Structure](#2-project-structure)
3. [Architecture](#3-architecture)
4. [Database Schema](#4-database-schema)
5. [Authentication System](#5-authentication-system)
6. [Core Features](#6-core-features)
7. [Known Issues & Solutions](#7-known-issues--solutions)
8. [Troubleshooting Guide](#8-troubleshooting-guide)
9. [Future Maintenance](#9-future-maintenance)

---

## 1. Project Overview

Campus Safety System is a web application that allows:
- **Students** to submit safety complaints and trigger SOS emergency alerts
- **Admins** to manage complaints, view SOS alerts on maps, and resolve emergencies

### Key Features
- User authentication (signup/login)
- Role-based access (student/admin)
- Complaint submission and tracking
- Real-time SOS alerts with GPS location
- Interactive maps (Leaflet.js)
- Elapsed time timer for emergencies
- Real-time updates via Supabase subscriptions

---

## 2. Project Structure

```
campus-safety-system/
├── index.html              # Landing page
├── login.html              # Login page
├── signup.html             # Registration page
├── dashboard.html          # Student dashboard
├── admin-dashboard.html    # Admin dashboard
├── sos-landing.html        # SOS trigger page
│
├── css/
│   ├── style.css           # Global styles
│   ├── dashboard.css       # Dashboard styles
│   ├── sos.css             # SOS button styles
│   └── sos-landing.css     # SOS landing page styles
│
└── js/
    ├── supabase-config.js  # Supabase client initialization
    ├── auth.js             # Login/signup form handlers
    ├── auth-guard.js       # Authentication guards & redirects
    ├── script.js           # Landing page scripts
    ├── dashboard.js        # Student dashboard logic
    ├── admin-dashboard.js  # Admin dashboard logic
    └── sos-landing.js      # SOS trigger logic
```

### File Responsibilities

| File | Purpose |
|------|---------|
| `supabase-config.js` | Initializes Supabase client with project URL and anon key |
| `auth-guard.js` | Centralized auth functions: `requireAuth()`, `requireAdmin()`, `requireStudent()`, `logout()` |
| `auth.js` | Handles login/signup form submissions only |
| `dashboard.js` | Student complaint submission and viewing |
| `admin-dashboard.js` | Admin complaint management, SOS alerts, maps, timers |
| `sos-landing.js` | GPS capture and SOS alert creation |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend                           │
│  (HTML/CSS/JavaScript ES6 Modules)                      │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              Supabase JavaScript SDK                    │
│  - @supabase/supabase-js (CDN)                          │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                    Supabase                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ PostgreSQL  │  │    Auth     │  │  Realtime   │     │
│  │  Database   │  │   System    │  │  Channels   │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                         │
│  Row Level Security (RLS) policies enforce access       │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Authentication**: Supabase Auth handles user sessions
2. **Database**: PostgreSQL with RLS policies
3. **Realtime**: WebSocket subscriptions for live updates
4. **Storage**: Not used (future: evidence uploads)

---

## 4. Database Schema

### Tables

#### `profiles`
```sql
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    roll_number TEXT UNIQUE NOT NULL,
    phone TEXT,
    user_type TEXT DEFAULT 'student' CHECK (user_type IN ('student', 'admin', 'security')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `complaints`
```sql
CREATE TABLE public.complaints (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    complaint_type TEXT NOT NULL,
    location TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `emergency_alerts`
```sql
CREATE TABLE public.emergency_alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    location TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Critical RLS Function

```sql
-- SECURITY DEFINER function to check user type without RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_type()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (SELECT user_type FROM public.profiles WHERE id = auth.uid()),
    'student'
  )::TEXT;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_user_type() TO authenticated;
```

### RLS Policies

```sql
-- Profiles: Users can read own, admins can read all
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
TO authenticated USING (id = auth.uid());

CREATE POLICY "profiles_select_admin" ON profiles FOR SELECT
TO authenticated USING (public.get_user_type() = 'admin');

-- Complaints: Students see own, admins see all
CREATE POLICY "complaints_select_own" ON complaints FOR SELECT
TO authenticated USING (student_id = auth.uid());

CREATE POLICY "complaints_select_admin" ON complaints FOR SELECT
TO authenticated USING (public.get_user_type() = 'admin');

-- Emergency alerts: Similar pattern
CREATE POLICY "alerts_select_own" ON emergency_alerts FOR SELECT
TO authenticated USING (student_id = auth.uid());

CREATE POLICY "alerts_select_admin" ON emergency_alerts FOR SELECT
TO authenticated USING (public.get_user_type() = 'admin');
```

---

## 5. Authentication System

### Flow

```
┌──────────┐     ┌──────────┐     ┌──────────────┐
│  Login   │────▶│ Supabase │────▶│   Redirect   │
│   Page   │     │   Auth   │     │  by Role     │
└──────────┘     └──────────┘     └──────────────┘
                                         │
                      ┌──────────────────┼──────────────────┐
                      ▼                  ▼                  ▼
               ┌──────────┐       ┌──────────┐       ┌──────────┐
               │ Student  │       │  Admin   │       │  Login   │
               │Dashboard │       │Dashboard │       │  (fail)  │
               └──────────┘       └──────────┘       └──────────┘
```

### Key Functions (auth-guard.js)

```javascript
// Check if user is authenticated
async function requireAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { redirect to login }
    return { user, profile };
}

// Check if user is admin
async function requireAdmin() {
    const result = await requireAuth();
    if (profile.user_type !== 'admin') { redirect to student dashboard }
    return result;
}

// Check if user is student
async function requireStudent() {
    const result = await requireAuth();
    if (profile.user_type === 'admin') { redirect to admin dashboard }
    return result;
}
```

### Redirect Lock Mechanism

Prevents infinite redirect loops:

```javascript
const REDIRECT_LOCK_KEY = 'auth_redirect_in_progress';
const REDIRECT_LOCK_TIMEOUT = 3000; // 3 seconds

function setRedirectLock() {
    sessionStorage.setItem(REDIRECT_LOCK_KEY, Date.now().toString());
}

function isRedirectLocked() {
    const lockTime = sessionStorage.getItem(REDIRECT_LOCK_KEY);
    if (!lockTime) return false;
    return (Date.now() - parseInt(lockTime)) < REDIRECT_LOCK_TIMEOUT;
}
```

---

## 6. Core Features

### 6.1 Complaint Submission (Student)

**File**: `dashboard.js`

```javascript
async function submitComplaint(formData) {
    const { error } = await supabase
        .from('complaints')
        .insert({
            student_id: currentUser.id,
            title: formData.title,
            description: formData.description,
            complaint_type: formData.type,
            location: formData.location
        });
}
```

### 6.2 SOS Alert (Student)

**File**: `sos-landing.js`

```javascript
async function triggerSOS() {
    // Get GPS coordinates
    const position = await getCurrentPosition();

    // Insert alert
    const { error } = await supabase
        .from('emergency_alerts')
        .insert({
            student_id: currentUser.id,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            location: 'GPS Location',
            status: 'active'
        });
}
```

### 6.3 Admin Dashboard

**File**: `admin-dashboard.js`

#### Fetching Data with Joins
```javascript
const { data } = await supabase
    .from('complaints')
    .select(`
        *,
        profiles!complaints_student_id_fkey (
            full_name,
            email,
            roll_number
        )
    `)
    .order('created_at', { ascending: false });
```

#### Real-time Subscription
```javascript
supabase
    .channel('emergency_alerts_changes')
    .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'emergency_alerts'
    }, handleNewAlert)
    .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'emergency_alerts'
    }, handleAlertUpdate)
    .subscribe();
```

### 6.4 Map Integration (Leaflet.js)

**Lazy Loading**: Maps only initialize when "View Location" is clicked

```javascript
function initMap(alertId, lat, lng) {
    const map = L.map(containerId, {
        center: [lat, lng],
        zoom: 16
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    L.marker([lat, lng]).addTo(map);

    // Fix for blank map when container was hidden
    setTimeout(() => map.invalidateSize(), 100);

    mapInstances[alertId] = map;
}
```

### 6.5 Elapsed Time Timer

**Lazy Activation**: Timer starts only when map is opened

```javascript
function startTimer(alertId, createdAt) {
    stopTimer(alertId); // Prevent duplicates

    const intervalId = setInterval(() => {
        const el = document.getElementById(`timer-${alertId}`);
        if (el) {
            el.textContent = formatElapsedTime(createdAt);
        }
    }, 1000);

    timerIntervals[alertId] = intervalId;
}

function stopTimer(alertId) {
    const intervalId = timerIntervals[alertId];
    if (intervalId) {
        clearInterval(intervalId);
        delete timerIntervals[alertId];
    }
}
```

**Timer Stops When**:
1. Map is hidden (user clicks "Hide Map")
2. SOS is resolved (manually or via real-time update)
3. Page is unloaded

---

## 7. Known Issues & Solutions

### Issue 1: RLS Infinite Recursion

**Problem**: RLS policy queries the same table it protects, causing infinite loop.

**Error**: `infinite recursion detected in policy for relation "profiles"`

**Cause**:
```sql
-- BAD: This causes recursion
CREATE POLICY "admin_read" ON profiles
USING ((SELECT user_type FROM profiles WHERE id = auth.uid()) = 'admin');
```

**Solution**: Use SECURITY DEFINER function:
```sql
CREATE FUNCTION public.get_user_type() RETURNS TEXT AS $$
  SELECT user_type FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- GOOD: No recursion
CREATE POLICY "admin_read" ON profiles
USING (public.get_user_type() = 'admin');
```

---

### Issue 2: Infinite Redirect Loop

**Problem**: Page keeps redirecting between login, dashboard, admin-dashboard.

**Cause**: Multiple auth checks firing simultaneously from different scripts.

**Solution**:
1. Centralized auth in `auth-guard.js`
2. Redirect lock using sessionStorage
3. Single auth check per page load

```javascript
function safeRedirect(url) {
    if (isRedirectLocked()) return false;
    setRedirectLock();
    window.location.href = url;
    return true;
}
```

---

### Issue 3: SOS INSERT Failing

**Problem**: `new row violates row-level security policy`

**Cause**: `requireAuth()` returns `{user, profile}` but code used it as plain user object.

**Wrong**:
```javascript
currentUser = await requireAuth();
student_id: currentUser.id  // undefined!
```

**Correct**:
```javascript
const authResult = await requireAuth();
currentUser = authResult.user;
student_id: currentUser.id  // works!
```

---

### Issue 4: Map Rendering Blank

**Problem**: Map container shows but tiles don't load.

**Cause**: Leaflet initialized while container is `display: none`.

**Solution**:
```javascript
// Make container visible FIRST
container.classList.add('active');

// Initialize map
const map = L.map(containerId);

// Force recalculation after DOM paint
setTimeout(() => {
    map.invalidateSize();
}, 100);
```

---

### Issue 5: Timer Not Stopping on Resolve

**Problem**: Timer keeps running after SOS is marked resolved.

**Cause**: Timer interval not cleared before re-rendering.

**Solution**:
```javascript
window.resolveAlert = async function(id) {
    // 1. Update database
    await supabase.from('emergency_alerts')
        .update({ status: 'resolved' })
        .eq('id', id);

    // 2. Update local state
    const alert = allAlerts.find(a => a.id == id);
    if (alert) alert.status = 'resolved';

    // 3. STOP TIMER explicitly
    stopTimer(id);

    // 4. Cleanup and re-render
    cleanupMaps();  // This also calls cleanupTimers()
    renderSOSAlerts();
};
```

---

### Issue 6: Email Showing "N/A"

**Problem**: Admin sees "N/A" for student email in complaints.

**Cause**: RLS blocks profile access due to recursion.

**Solution**: Same as Issue 1 - use `get_user_type()` SECURITY DEFINER function.

---

### Issue 7: Foreign Key Join Ambiguity

**Problem**: Supabase can't determine which FK to use.

**Error**: `Could not find a relationship between 'complaints' and 'profiles'`

**Solution**: Explicit FK reference:
```javascript
// Wrong
profiles (full_name, email)

// Correct
profiles!complaints_student_id_fkey (full_name, email)
```

---

## 8. Troubleshooting Guide

### Debug Checklist

#### Auth Issues
```javascript
// Check current user
const { data: { user } } = await supabase.auth.getUser();
console.log('Current user:', user);

// Check session
const { data: { session } } = await supabase.auth.getSession();
console.log('Session:', session);
```

#### RLS Issues
```sql
-- In Supabase SQL Editor, check what user sees
SELECT * FROM complaints;  -- As authenticated user
SELECT auth.uid();         -- Check current user ID
SELECT public.get_user_type();  -- Check user type
```

#### Timer Issues
```javascript
// Check active timers
console.log('Active timers:', Object.keys(timerIntervals).length);
console.log('Timer IDs:', timerIntervals);
```

#### Map Issues
```javascript
// Check map instances
console.log('Map instances:', Object.keys(mapInstances).length);

// Force invalidate all maps
Object.values(mapInstances).forEach(map => map.invalidateSize());
```

### Common Console Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `auth.uid() is null` | User not logged in | Redirect to login |
| `permission denied for table` | RLS blocking | Check policies |
| `infinite recursion` | Policy queries same table | Use SECURITY DEFINER |
| `Leaflet: Map container not found` | Wrong container ID | Verify element exists |
| `Cannot read property 'id' of undefined` | User object extraction | Use `authResult.user.id` |

---

## 9. Future Maintenance

### Adding New Features

1. **New Table**: Always add RLS policies
2. **New Page**: Import `auth-guard.js` and call appropriate guard
3. **New Real-time Feature**: Add to existing subscription channel

### Security Checklist

- [ ] All tables have RLS enabled
- [ ] INSERT policies check `student_id = auth.uid()`
- [ ] Admin policies use `get_user_type() = 'admin'`
- [ ] No sensitive data in frontend code
- [ ] Supabase anon key (not service key) in frontend

### Performance Tips

1. **Maps**: Always lazy-load (on click, not on page load)
2. **Timers**: Clean up on hide/resolve to prevent memory leaks
3. **Subscriptions**: Unsubscribe on page unload
4. **Queries**: Use specific column selection, not `*`

### Updating Supabase

If moving to new Supabase project:

1. Update `supabase-config.js`:
```javascript
const SUPABASE_URL = 'https://NEW_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'NEW_ANON_KEY';
```

2. Run all SQL migrations (tables, functions, policies)
3. Test auth flow completely
4. Test RLS with both student and admin

### Backup Commands

```bash
# Export schema
pg_dump --schema-only DATABASE_URL > schema.sql

# Export data
pg_dump --data-only DATABASE_URL > data.sql
```

---

## Quick Reference

### Supabase Client
```javascript
import { supabase } from './supabase-config.js';
```

### Auth Guards
```javascript
import { requireAuth, requireAdmin, requireStudent, logout } from './auth-guard.js';
```

### Common Operations
```javascript
// Insert
await supabase.from('table').insert({ ... });

// Select
await supabase.from('table').select('*').eq('id', id);

// Update
await supabase.from('table').update({ ... }).eq('id', id);

// Delete
await supabase.from('table').delete().eq('id', id);

// Join
await supabase.from('table').select('*, other_table!fk_name(columns)');
```

---

## Contact

For issues with this codebase, refer to this document first. Most common problems and their solutions are documented above.

---

**End of Report**
