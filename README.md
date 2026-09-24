# AttendPulse — Smart Attendance Monitoring System

AttendPulse is a web-based attendance monitoring system designed to help colleges track student attendance and automatically notify parents when a student's attendance falls below the required threshold.

The system uses **Firebase Firestore** for attendance data, **React/Vite** for the frontend, **GitHub Actions** for scheduled attendance checks, and **Brevo SMTP** for sending email alerts.

## 🚀 Features

* 📊 Student attendance dashboard
* 👨‍🎓 Student-wise and subject-wise attendance tracking
* ⚠️ Automatic detection of attendance below **75%**
* 📧 Parent email notifications
* 🔄 Automated notification cycle every **20 days**
* 🛡️ Retry-safe notification system
* 🔐 Firebase Authentication & Firestore
* ☁️ Vercel deployment for the frontend
* ⚙️ GitHub Actions for automated backend execution
* 📝 Notification history stored in Firestore
* 📱 Responsive web interface

## 🔄 How It Works

1. Student attendance data is stored in **Firebase Firestore**.
2. GitHub Actions runs the attendance cron workflow on a scheduled basis.
3. `attendanceCron.js` checks whether the 20-day notification cycle is due.
4. Students with attendance below **75%** are identified.
5. The system checks whether a notification has already been sent during the current cycle.
6. Eligible parents receive an attendance warning through email.
7. Notification status is stored in Firestore.
8. The cycle advances only after all required notifications are processed successfully.
9. Failed notifications remain eligible for retry during the next execution.

## 📅 Notification Cycle

AttendPulse uses a **20-day notification cycle**.

The GitHub Actions workflow can run daily, but the Firestore scheduler prevents unnecessary duplicate notifications.

```text
GitHub Actions
      │
      │ Daily check
      ▼
Is 20-day cycle due?
      │
   ┌──┴──┐
   │     │
  No    Yes
   │     │
   ▼     ▼
 Stop   Check students
              │
              ▼
       Attendance < 75%?
              │
          ┌───┴───┐
          │       │
         No      Yes
          │       │
        Skip   Send Email
                  │
                  ▼
           Save notification
```

## 📧 Email Notification

Parents receive an email when one or more subjects fall below the required attendance percentage.

**Subject:**

```text
Attendance Warning – Below 75%
```

The email contains the student's relevant low-attendance subjects rather than unrelated attendance information.

## 🗄️ Firestore Structure

### `students`

Stores student attendance information and parent contact details.

Example:

```text
students/
 └── studentId
      ├── name
      ├── registerNo
      ├── parentEmail
      ├── subjects
      └── ...
```

The system supports parent email fields such as:

```text
parentEmail
parent_email
parentMail
```

### `Notifications`

Stores notification history and processing status.

```text
Notifications/
 └── notificationId
      ├── studentId
      ├── cycleId
      ├── status
      ├── createdAt
      └── ...
```

Possible statuses:

```text
pending
sent
failed
```

### `System/attendanceCron`

Stores the scheduler state.

```text
System/
 └── attendanceCron
      ├── nextNotificationAt
      ├── currentCycleId
      ├── isRunning
      └── ...
```

## 🔐 Retry Safety

AttendPulse is designed to avoid duplicate emails.

For every notification cycle, the system checks previously successful notifications:

```text
Student
   │
   ▼
Already sent in current cycle?
   │
 ┌─┴─┐
Yes  No
 │    │
Skip  Send
       │
       ▼
     Sent
```

If some emails fail, the cycle remains available for retry instead of being marked completely successful.

## 🛠️ Tech Stack

### Frontend

* React
* Vite
* JavaScript
* Firebase Client SDK
* CSS

### Backend / Automation

* Node.js
* Firebase Admin SDK
* Firestore
* Nodemailer

### Email

* Brevo SMTP

### Deployment

* Vercel — Frontend
* GitHub Actions — Scheduled automation
* Firebase — Authentication & Database



## 🤖 GitHub Actions

The attendance checker runs through GitHub Actions.

Workflow location:

```text
.github/workflows/attendance-cron.yml
```

The workflow:

1. Checks out the repository
2. Installs Node.js
3. Installs dependencies
4. Loads encrypted GitHub Secrets
5. Runs:

```bash
npm run cron
```

Required GitHub Secrets include:

```text
FIREBASE_PROJECT_ID
FIREBASE_SERVICE_ACCOUNT_KEY

BREVO_SMTP_HOST
BREVO_SMTP_PORT
BREVO_SMTP_USER
BREVO_SMTP_KEY
BREVO_FROM_NAME
BREVO_FROM_EMAIL
```

## 📊 Notification Processing

Example execution:

```text
[CRON] Mode: PRODUCTION
[CRON] Checking 20-day notification cycle
[CRON] Students found: 8
[CRON] Students requiring attendance alerts: 6

[CRON] Sending notification for: Student 1
[EMAIL] Sent successfully

[CRON] Sending notification for: Student 2
[EMAIL] Sent successfully

...

[CRON] Execution Summary: 6 sent, 0 failed
[CRON] Job completed
```

## 🎯 Project Objective

AttendPulse aims to reduce manual attendance monitoring by providing an automated system that:

* Identifies students with low attendance
* Keeps parents informed
* Reduces manual follow-up
* Maintains notification history
* Prevents duplicate notifications
* Provides a scalable cloud-based architecture

## 🔮 Future Enhancements

* 📱 Mobile application
* 📈 Attendance analytics
* 📊 Faculty/admin reports
* 🔔 Additional notification channels
* 👨‍👩‍👧 Parent portal
* 📅 Custom notification schedules
* 📤 Export attendance reports
* 📉 Attendance trend visualization
* 🔐 Role-based access control

## 👩‍💻 Author

**Jenifer V**

BCA — Computer Applications
SRM Institute of Science & Technology

---

