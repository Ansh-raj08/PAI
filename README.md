# Projexa AI - SOS Module PRD

## 1. Document Control
- Product: Projexa AI Campus Safety Platform
- Module: SOS Emergency Response
- Date: 2026-03-15
- Status: Draft v1 (based on current backend implementation)
- Source of truth for this PRD: existing backend PHP APIs in `backend/api`

## 2. Product Context
Projexa AI is a campus safety system where users can register, log in, submit complaints, and receive notifications. The SOS module is a high-priority emergency flow that lets a logged-in student trigger an emergency alert and notify administrators immediately.

This PRD captures:
- What already exists in backend code
- What frontend should integrate now
- What must be improved next for production-grade SOS operations

## 3. Goals and Non-Goals
### Goals
- Enable a student to trigger an SOS alert in one action.
- Persist SOS events as emergency complaints and emergency alerts.
- Notify all admin users when an SOS is triggered.
- Provide traceability through complaints and notifications.

### Non-Goals (Current Scope)
- Real-time push infrastructure (WebSocket/FCM/APNs) is not implemented.
- Dispatch workflow orchestration (assign responder, ETA tracking) is not implemented.
- Geofencing and route optimization are not implemented.
- Multi-channel escalation (SMS/call/email) is not implemented.

## 4. Personas
- Student: triggers SOS during emergency.
- Admin/Security Staff: receives SOS notification and updates incident status.

## 5. Current Backend Architecture (As Implemented)
- Language/Runtime: PHP with session-based auth.
- Database: MySQL (`campussafety`) via `mysqli`.
- Connection config: `backend/config/db_config.php`.
- API style: form-data `POST` for writes; JSON response payloads.

### Authentication Model
- `login.php` creates PHP session (`$_SESSION['user_id']`, `$_SESSION['user_type']`, `$_SESSION['full_name']`).
- Most protected endpoints require active session and return `Please login first` if missing.
- Admin-only operation enforced in `update_complaint_status.php`.

## 6. Existing API Inventory
### Auth and user management
- `backend/api/signup.php`
	- Method: `POST`
	- Inputs: `roll_number`, `email`, `password`, `full_name`, optional `phone`
	- Behavior: validates required fields, email format, uniqueness on email/roll number; creates `student` user with bcrypt password.
	- Output: success/failure JSON with `user_id` on success.

- `backend/api/login.php`
	- Method: `POST`
	- Inputs: `email`, `password`
	- Behavior: validates active user (`is_active = TRUE`), verifies bcrypt password, creates session.
	- Output: success/failure JSON with `user_id`, `user_type`.

### Complaint management
- `backend/api/submit_complaint.php`
	- Method: `POST` (session required)
	- Inputs: `complaint_type`, `title`, `description`, optional `location`
	- Behavior: inserts complaint linked to current student.

- `backend/api/get_complaints.php`
	- Method: currently read without method restriction (session required)
	- Student: returns own complaints.
	- Non-student (including admin): returns all complaints.

- `backend/api/update_complaint_status.php`
	- Method: `POST` (admin session required)
	- Inputs: `complaint_id`, `status`
	- Behavior: updates complaint status.

### SOS and notifications
- `backend/api/trigger_emergency.php`
	- Method: `POST` (session required)
	- Inputs: `location` (default `Campus`), optional `latitude`, `longitude`
	- Behavior:
		1. Creates complaint with:
			 - `complaint_type = medical`
			 - `title = EMERGENCY SOS ALERT`
			 - `priority = emergency`
		2. Creates row in `emergency_alerts` with location/coordinates.
		3. Creates notification for each admin:
			 - title: `EMERGENCY SOS`
			 - message: `Student emergency alert triggered!`
	- Output: `success: true/false`, message.

- `backend/api/get_notifications.php`
	- Method: currently read without method restriction (session required)
	- Behavior: returns latest 20 notifications for current user.

- `backend/api/add_comment.php`
	- Current state: appears to duplicate notification listing logic (not a comment API yet).

## 7. Inferred Data Model
From current SQL usage, these tables/fields are required:

- `users`
	- `user_id` (PK), `roll_number`, `email`, `password`, `full_name`, `phone`, `user_type`, `is_active`

- `complaints`
	- `complaint_id` (PK), `student_id`, `complaint_type`, `title`, `description`, `location`, `priority`, `status`, `created_at`

- `emergency_alerts`
	- Likely fields: `alert_id` (PK), `student_id`, `location`, `latitude`, `longitude`, `created_at`

- `notifications`
	- `notification_id` (PK), `user_id`, `title`, `message`, `is_read`, `created_at`

## 8. SOS Module Requirements
### 8.1 Functional Requirements
1. Student can trigger SOS from app in one tap while logged in.
2. System must persist SOS in both:
	 - `complaints` (for workflow/status tracking)
	 - `emergency_alerts` (for emergency audit/location context)
3. System must notify all admins when SOS is created.
4. Admin must be able to view SOS incidents through complaint listing.
5. Admin must be able to update SOS complaint status.
6. Student must be able to see resulting incident status updates via complaint history.

### 8.2 Frontend Integration Requirements (Immediate)
1. Frontend auth must use session-based flow and preserve cookies.
2. SOS trigger call:
	 - Endpoint: `backend/api/trigger_emergency.php`
	 - Method: `POST`
	 - Payload: `location`, optional `latitude`, `longitude`
3. After trigger success, frontend should:
	 - Show confirmation state immediately.
	 - Poll `get_complaints.php` and/or `get_notifications.php` for updates.
4. Admin dashboard should poll notifications and complaints periodically until realtime is added.

### 8.3 Non-Functional Requirements
1. Reliability: SOS request should return clear success/failure message.
2. Latency target (recommended): API response under 2 seconds under normal load.
3. Security: only authenticated users can trigger SOS; only admins can update status.
4. Observability (recommended): log each SOS event with timestamp and user_id.

## 9. Current Gaps and Risks
1. No explicit DB transaction in `trigger_emergency.php`:
	 - Complaint, emergency alert, and notifications can become partially written on failure.
2. No input validation for coordinate ranges:
	 - Invalid latitude/longitude may be inserted.
3. Fixed SOS type currently set to `medical`:
	 - Cannot distinguish fire, security threat, harassment, etc.
4. `get_complaints.php` and `get_notifications.php` do not restrict HTTP method:
	 - Should explicitly enforce `GET`.
5. `add_comment.php` is not implemented as a comment endpoint:
	 - Duplicate of notification retrieval logic.
6. No rate limiting / anti-spam for SOS endpoint.
7. Session auth is stateful:
	 - Frontend must be hosted/configured to preserve cookie/session behavior.

## 10. Recommended Backend Improvements (Next Iteration)
1. Wrap SOS writes in a single DB transaction.
2. Validate and sanitize all inputs, including coordinate ranges.
3. Introduce `sos_type` and `severity_level` enums.
4. Add `incident_code` and structured audit trail.
5. Convert notification pipeline to event-based async queue.
6. Implement real comment API in `add_comment.php`.
7. Add endpoint to mark notification as read.
8. Add rate limiting for SOS trigger per user/device.
9. Enforce method checks on read endpoints.

## 11. Frontend-Ready API Contracts
### Trigger SOS
- Endpoint: `backend/api/trigger_emergency.php`
- Method: `POST`
- Auth: session required
- Request fields:
	- `location`: string (optional, defaults to `Campus`)
	- `latitude`: float (optional)
	- `longitude`: float (optional)
- Success response:
```json
{
	"success": true,
	"message": "Emergency alert sent"
}
```

### Fetch notifications
- Endpoint: `backend/api/get_notifications.php`
- Auth: session required
- Response contains: `notification_id`, `title`, `message`, `is_read`, `created_at`

### Fetch complaints
- Endpoint: `backend/api/get_complaints.php`
- Auth: session required
- Student sees own complaints; admin/non-student sees all complaints.

### Update complaint status (Admin)
- Endpoint: `backend/api/update_complaint_status.php`
- Method: `POST`
- Auth: admin session required
- Required fields: `complaint_id`, `status`

## 12. Suggested Milestones
1. Milestone 1: Frontend SOS trigger + success/failure UX wired to current API.
2. Milestone 2: Admin incident board using complaints + notifications polling.
3. Milestone 3: Backend hardening (transaction, validation, method guards).
4. Milestone 4: Realtime and escalation channels.

## 13. Acceptance Criteria (Current PRD Baseline)
1. Logged-in student can trigger SOS and receives successful response.
2. SOS trigger creates:
	 - one emergency-priority complaint
	 - one emergency alert record
	 - one notification per admin
3. Admin can see SOS-generated complaint in complaint list.
4. Admin can update complaint status.
5. Student can view complaint status in their complaint list.

## 14. Open Questions
1. Should SOS support multiple categories (`medical`, `security`, `fire`, `other`) at trigger time?
2. Should responders be users with a new role separate from `admin`?
3. What is the expected acknowledgement SLA for an SOS event?
4. Is campus map/geolocation accuracy required for v1 frontend?
5. Should notification delivery include email/SMS fallback in v1 or v2?