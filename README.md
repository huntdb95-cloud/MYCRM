# MYCRM - Independent Insurance Agent CRM

A production-quality CRM web application built for independent insurance agents, featuring customer management, SMS conversations via Twilio, task tracking, document uploads, and role-based access control.

## Features

- **Customer Management**: Full CRUD operations for customers/insureds with policy tracking
- **SMS Integration**: Inbound and outbound SMS via Twilio, automatically linked to customer records
- **Task Management**: Kanban-style task board with assignments and due dates
- **Document Management**: Upload and store documents per customer
- **Notes & Activity**: Track customer interactions and notes
- **Role-Based Access**: Admin, Agent, and Assistant roles with appropriate permissions
- **Multi-Tenant Ready**: Agency-based structure for future multi-agency support
- **Responsive UI**: Mobile and desktop optimized interface

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript (ESM modules)
- **Backend**: Firebase (Firestore, Storage, Auth, Cloud Functions)
- **SMS**: Twilio API
- **Hosting**: Firebase Hosting (or GitHub Pages)

## Project Structure

```
MYCRM/
├── index.html              # Login/signup page
├── app.html                # Main CRM dashboard
├── customers.html          # Customer list page
├── customer.html           # Customer detail page
├── inbox.html              # SMS conversations inbox
├── tasks.html              # Task board
├── settings.html           # User settings and Twilio config
├── styles.css              # Global styles
├── js/
│   ├── firebase.js         # Firebase initialization
│   ├── auth-guard.js       # Route protection and user context
│   ├── models.js           # Data models and validators
│   ├── ui.js               # UI helpers (toast, modal, etc.)
│   ├── router.js           # Navigation router
│   ├── customers.js        # Customer CRUD operations
│   ├── messages.js         # SMS message handling
│   ├── tasks.js            # Task management
│   ├── uploads.js          # Document uploads
│   ├── app.js              # Main app shell logic
│   ├── customers-page.js   # Customers page logic
│   ├── customer-page.js    # Customer detail page logic
│   ├── inbox-page.js       # Inbox page logic
│   ├── tasks-page.js       # Tasks page logic
│   └── settings-page.js    # Settings page logic
├── functions/
│   ├── index.js            # Firebase Cloud Functions
│   └── package.json        # Functions dependencies
├── firestore.rules         # Firestore security rules
├── storage.rules           # Storage security rules
├── firestore.indexes.json  # Firestore indexes
└── firebase.json           # Firebase configuration

```

## Setup Instructions

### Prerequisites

1. **Firebase Account**: Sign up at [firebase.google.com](https://firebase.google.com)
2. **Node.js**: Version 18 or higher
3. **Firebase CLI**: Install via `npm install -g firebase-tools`
4. **Twilio Account**: Sign up at [twilio.com](https://www.twilio.com) and get a phone number

### 1. Firebase Project Setup

1. Create a new Firebase project at [Firebase Console](https://console.firebase.google.com)
2. Enable the following services:
   - **Authentication**: Email/Password provider
   - **Firestore Database**: Start in production mode
   - **Storage**: Start in production mode
   - **Functions**: Enable Cloud Functions

3. Get your Firebase config from Project Settings > General > Your apps > Web app
4. Update `js/firebase.js` with your Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID",
};
```

### 2. Deploy Firestore Rules and Indexes

```bash
# Login to Firebase
firebase login

# Initialize Firebase (if not already done)
firebase init

# Deploy rules and indexes
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```

### 3. Setup Firebase Cloud Functions

1. Navigate to the functions directory:

```bash
cd functions
npm install
```

2. Set Twilio credentials using Firebase Functions config:

```bash
firebase functions:config:set \
  twilio.account_sid="YOUR_TWILIO_ACCOUNT_SID" \
  twilio.auth_token="YOUR_TWILIO_AUTH_TOKEN" \
  twilio.webhook_auth="OPTIONAL_WEBHOOK_AUTH_TOKEN"
```

**Important**: The `twilio.webhook_auth` should be set to your Twilio Auth Token (same as `twilio.auth_token`) for webhook signature validation. Alternatively, you can use environment variables:

```bash
# Using Firebase environment variables (recommended)
firebase functions:config:set twilio.account_sid="ACxxxxx" twilio.auth_token="your_auth_token" twilio.webhook_auth="your_auth_token"
```

3. Deploy functions and hosting:

```bash
cd ..
firebase deploy --only functions,hosting
```

### 4. Configure Twilio Webhooks

**CRITICAL**: Use your custom domain `bookautomated.com` for webhook URLs. If custom domain is not yet connected, use the Firebase Functions URL format shown below.

#### Option A: Using Custom Domain (bookautomated.com) - RECOMMENDED

1. Go to [Twilio Console](https://console.twilio.com) > Phone Numbers > Manage > Active Numbers
2. Click on your Twilio phone number: **(615) 808-8559** (+16158088559)
3. Configure **Messaging**:
   - **A MESSAGE COMES IN**: `POST https://bookautomated.com/twilio/sms`
   - **STATUS CALLBACK URL** (optional): `POST https://bookautomated.com/twilio/status/sms`
4. Configure **Voice**:
   - **A CALL COMES IN**: `POST https://bookautomated.com/twilio/voice`
5. Save the configuration

#### Option B: Using Firebase Functions URL (Fallback)

If custom domain is not yet connected, use these URLs:

1. **Messaging Webhook**: 
   ```
   POST https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/twilio/twilio/sms
   ```
2. **Voice Webhook**: 
   ```
   POST https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/twilio/twilio/voice
   ```
3. **Status Callback** (optional): 
   ```
   POST https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/twilio/twilio/status/sms
   ```

**Note**: Replace `YOUR_REGION` and `YOUR_PROJECT` with your actual Firebase project details. You can find these in the Firebase Console > Functions.

### 5. Configure Twilio Settings in CRM

1. Log in to the CRM
2. Go to Settings page
3. Enter your Twilio phone number: `+16158088559`
4. Configure voice settings (optional):
   - Forward to number (E.164 format)
   - Business name: "BookAutomated"
   - Enable voicemail
5. Configure SMS settings (optional):
   - Enable auto-reply
   - Auto-reply text
6. Save settings

### 6. Deploy Hosting

#### Option A: Firebase Hosting (Recommended)

```bash
firebase deploy --only hosting
```

Your app will be available at: `https://YOUR_PROJECT_ID.web.app`

#### Option B: GitHub Pages

1. Push your code to a GitHub repository
2. Go to repository Settings > Pages
3. Set source to `main` branch and `/` root directory
4. Your app will be available at: `https://YOUR_USERNAME.github.io/YOUR_REPO`

**Note**: For GitHub Pages, update all absolute paths in HTML files from `/` to `./` or use relative paths.

### 7. Local Development with Emulators

1. Install Firebase emulators:

```bash
npm install -g firebase-tools
firebase init emulators
```

2. Start emulators:

```bash
firebase emulators:start
```

3. Access emulators:
   - UI: http://localhost:4000
   - Functions: http://localhost:5001
   - Firestore: http://localhost:8080
   - Storage: http://localhost:9199

4. For local Twilio webhook testing, use a tool like [ngrok](https://ngrok.com):

```bash
ngrok http 5001
```

Then set the Twilio webhook URL to the ngrok URL.

## Manual Testing Plan

### 1. User Registration and Login

1. Open the app in your browser
2. Click "Sign up" and create a new account
3. Verify you're redirected to `/app.html` after signup
4. Log out and log back in
5. Verify you're redirected to `/app.html` after login

### 2. Customer Management

1. Navigate to Customers page
2. Click "+ New Customer"
3. Fill in customer details (name, phone, email)
4. Save and verify customer appears in list
5. Click on customer to view detail page
6. Edit customer and verify changes save
7. Delete a customer and verify removal

### 3. SMS Integration

1. **Configure Twilio in Settings**:
   - Go to Settings page
   - Enter Twilio number: `+16158088559`
   - Save settings

2. **Test Outbound SMS**:
   - Create a customer with a phone number
   - Go to customer detail page > Messages tab
   - Send a test SMS message
   - Verify message appears in thread
   - Check your phone to confirm receipt

3. **Test Inbound SMS**:
   - Send an SMS from your phone to **(615) 808-8559**
   - Verify the message appears in the CRM under the correct customer
   - If customer doesn't exist, verify a new "Unknown" lead is created
   - Check that conversation is created and linked

4. **Test Voice Call**:
   - Call **(615) 808-8559**
   - Test IVR menu (press 1, 2, 3, or 0)
   - Leave a voicemail
   - Verify call record is created in Firestore
   - Verify follow-up task is created for voicemail

### 4. Tasks

1. Navigate to Tasks page
2. Create a new task
3. Verify task appears in "Open" column
4. Edit task and change status to "In Progress"
5. Verify task moves to "In Progress" column
6. Mark task as "Done"
7. Verify task moves to "Done" column

### 5. Documents

1. Go to a customer detail page
2. Navigate to Documents tab
3. Click "+ Upload Document"
4. Select a file and upload
5. Verify file appears in list
6. Click download and verify file downloads

### 6. Notes

1. Go to customer detail page > Notes tab
2. Add a note
3. Verify note appears in list
4. Verify note shows timestamp and content

## Security Notes

- **Never commit secrets**: Twilio credentials should only be in Firebase Functions config or environment variables
- **Firestore Rules**: All data access is scoped to agency membership
- **Storage Rules**: File uploads are limited to 10MB and require authentication
- **Role-Based Access**: Assistants have limited permissions (read-only for customers, can't delete)

## Data Model

### Agencies
- Multi-tenant structure (defaults to single agency)
- Each agency has users, customers, conversations, tasks, uploads

### Users
- Roles: `admin`, `agent`, `assistant`
- Stored under `agencies/{agencyId}/users/{uid}`

### Customers
- Stored under `agencies/{agencyId}/customers/{customerId}`
- Phone numbers normalized to E.164 format
- Indexed by phone for fast SMS lookup

### Conversations
- One per customer + Twilio number combination
- Messages stored as subcollection
- Tracks unread counts per user

### Tasks
- Can be assigned to customers or standalone
- Status: `open`, `in-progress`, `done`
- Priority: `low`, `med`, `high`

## Troubleshooting

### Functions not deploying
- Check Node.js version (must be 18+)
- Verify `functions/package.json` is correct
- Check Firebase CLI is up to date: `npm install -g firebase-tools@latest`

### Twilio webhook not receiving messages
- Verify webhook URL is correct in Twilio console
- Check function logs: `firebase functions:log`
- Verify Twilio credentials are set correctly

### Firestore permission errors
- Check Firestore rules are deployed: `firebase deploy --only firestore:rules`
- Verify user is authenticated and belongs to agency
- Check user role has required permissions

### Phone number normalization issues
- Ensure phone numbers are in valid format
- Check `js/models.js` normalization function
- Verify phone index is being updated when customer phone changes

## Production Checklist

- [ ] Update Firebase config in `js/firebase.js`
- [ ] Deploy Firestore rules and indexes
- [ ] Deploy Storage rules
- [ ] Deploy Cloud Functions
- [ ] Set Twilio credentials in Functions config
- [ ] Configure Twilio webhook URL
- [ ] Test SMS inbound/outbound flow
- [ ] Set up custom domain (optional)
- [ ] Enable Firebase Analytics (optional)
- [ ] Set up error monitoring (optional)

## Twilio Webhook URLs (IMPORTANT)

**Use these exact URLs in your Twilio Console configuration:**

### Primary URLs (Custom Domain - bookautomated.com)

1. **SMS Inbound Webhook**:
   ```
   POST https://bookautomated.com/twilio/sms
   ```
   Configure in: Twilio Console > Phone Numbers > (615) 808-8559 > Messaging > "A MESSAGE COMES IN"

2. **Voice Inbound Webhook**:
   ```
   POST https://bookautomated.com/twilio/voice
   ```
   Configure in: Twilio Console > Phone Numbers > (615) 808-8559 > Voice > "A CALL COMES IN"

3. **SMS Status Callback** (optional):
   ```
   POST https://bookautomated.com/twilio/status/sms
   ```
   Configure in: Twilio Console > Phone Numbers > (615) 808-8559 > Messaging > "STATUS CALLBACK URL"

### Fallback URLs (If custom domain not connected)

If `bookautomated.com` is not yet connected to Firebase Hosting, use these Firebase Functions URLs:

1. **SMS Inbound**: `POST https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/twilio/twilio/sms`
2. **Voice Inbound**: `POST https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/twilio/twilio/voice`
3. **SMS Status**: `POST https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/twilio/twilio/status/sms`

**To find your region and project ID**: Check Firebase Console > Functions > Your function URL

## Support

For issues or questions:
1. Check Firebase Console logs
2. Check browser console for errors
3. Review Firestore rules for permission issues
4. Verify Twilio webhook configuration
5. Check Functions logs: `firebase functions:log`

## License

This project is provided as-is for use in your insurance agency CRM.
