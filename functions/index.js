// functions/index.js - Firebase Cloud Functions for Twilio integration

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const twilio = require('twilio');

admin.initializeApp();

const db = admin.firestore();

// Get Twilio credentials from environment
const TWILIO_ACCOUNT_SID = functions.config().twilio?.account_sid || process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = functions.config().twilio?.auth_token || process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WEBHOOK_AUTH = functions.config().twilio?.webhook_auth || process.env.TWILIO_WEBHOOK_AUTH;

// Initialize Twilio client
let twilioClient = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

/**
 * Normalize phone number to E.164
 */
function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `+${digits}`;
  }
  if (phone.trim().startsWith('+')) {
    const afterPlus = phone.replace(/[^\d]/g, '');
    if (afterPlus.length >= 10) {
      return `+${afterPlus}`;
    }
  }
  return null;
}

/**
 * Find customer by phone using phone index
 */
async function findCustomerByPhone(agencyId, phoneE164) {
  const indexRef = db.collection('agencies').doc(agencyId).collection('phoneIndex').doc(phoneE164);
  const indexSnap = await indexRef.get();
  
  if (!indexSnap.exists) {
    return null;
  }
  
  const customerId = indexSnap.data().customerId;
  const customerRef = db.collection('agencies').doc(agencyId).collection('customers').doc(customerId);
  const customerSnap = await customerRef.get();
  
  if (!customerSnap.exists) {
    return null;
  }
  
  return {
    id: customerSnap.id,
    ...customerSnap.data()
  };
}

/**
 * Create new lead customer from phone number
 */
async function createLeadFromPhone(agencyId, phoneE164) {
  const customersRef = db.collection('agencies').doc(agencyId).collection('customers');
  const customerRef = customersRef.doc();
  
  const customerData = {
    fullName: 'Unknown',
    firstName: null,
    lastName: null,
    phoneE164: phoneE164,
    phoneRaw: phoneE164,
    email: null,
    address: {},
    preferredLanguage: 'en',
    tags: [],
    status: 'lead',
    source: 'sms',
    assignedToUid: null,
    lastContactAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessageSnippet: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  
  await customerRef.set(customerData);
  
  // Create phone index entry
  const indexRef = db.collection('agencies').doc(agencyId).collection('phoneIndex').doc(phoneE164);
  await indexRef.set({
    customerId: customerRef.id,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  return {
    id: customerRef.id,
    ...customerData
  };
}

/**
 * Get or create conversation
 */
async function getOrCreateConversation(agencyId, customerId, phoneE164, twilioNumber) {
  const conversationsRef = db.collection('agencies').doc(agencyId).collection('conversations');
  
  // Try to find existing conversation
  const existingQuery = await conversationsRef
    .where('customerId', '==', customerId)
    .where('twilioNumber', '==', twilioNumber)
    .limit(1)
    .get();
  
  if (!existingQuery.empty) {
    const conv = existingQuery.docs[0];
    return {
      id: conv.id,
      ...conv.data()
    };
  }
  
  // Create new conversation
  const convRef = conversationsRef.doc();
  const convData = {
    customerId: customerId,
    phoneE164: phoneE164,
    twilioNumber: twilioNumber,
    lastMessageAt: null,
    lastMessageSnippet: null,
    unreadCountByUid: {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  
  await convRef.set(convData);
  
  return {
    id: convRef.id,
    ...convData
  };
}

/**
 * Twilio webhook for inbound SMS
 */
exports.twilioWebhook = functions.https.onRequest(async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }
  
  // Validate Twilio signature (optional but recommended)
  // You can implement signature validation here using TWILIO_WEBHOOK_AUTH
  
  try {
    const fromPhone = req.body.From;
    const toPhone = req.body.To;
    const body = req.body.Body;
    const messageSid = req.body.MessageSid;
    
    if (!fromPhone || !toPhone || !body) {
      return res.status(400).send('Missing required fields');
    }
    
    // Normalize phone numbers
    const fromE164 = normalizePhone(fromPhone);
    if (!fromE164) {
      console.error('Invalid phone number format:', fromPhone);
      return res.status(400).send('Invalid phone number format');
    }
    
    // For now, we'll use a default agency ID
    // In production, you'd map twilioNumber to agencyId
    // For simplicity, we'll use the first agency or a default
    const agenciesSnapshot = await db.collection('agencies').limit(1).get();
    if (agenciesSnapshot.empty) {
      return res.status(500).send('No agencies configured');
    }
    
    const agencyId = agenciesSnapshot.docs[0].id;
    
    // Get Twilio settings for agency
    const twilioSettingsRef = db.collection('agencies').doc(agencyId).collection('settings').doc('twilio');
    const twilioSettings = await twilioSettingsRef.get();
    const twilioNumber = twilioSettings.exists ? twilioSettings.data().twilioNumber : toPhone;
    
    // Find or create customer
    let customer = await findCustomerByPhone(agencyId, fromE164);
    
    if (!customer) {
      customer = await createLeadFromPhone(agencyId, fromE164);
    }
    
    // Get or create conversation
    const conversation = await getOrCreateConversation(agencyId, customer.id, fromE164, twilioNumber);
    
    // Add message to conversation
    const messagesRef = db.collection('agencies').doc(agencyId)
      .collection('conversations').doc(conversation.id)
      .collection('messages');
    
    const messageRef = messagesRef.doc();
    const messageData = {
      direction: 'inbound',
      body: body,
      fromE164: fromE164,
      toE164: twilioNumber,
      status: 'received',
      twilioSid: messageSid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    await messageRef.set(messageData);
    
    // Update conversation
    const conversationRef = db.collection('agencies').doc(agencyId)
      .collection('conversations').doc(conversation.id);
    
    await conversationRef.update({
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageSnippet: body.substring(0, 100),
      [`unreadCountByUid.${customer.assignedToUid || 'all'}`]: admin.firestore.FieldValue.increment(1),
    });
    
    // Update customer
    const customerRef = db.collection('agencies').doc(agencyId)
      .collection('customers').doc(customer.id);
    
    await customerRef.update({
      lastContactAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageSnippet: body.substring(0, 100),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Return TwiML response (empty for now, or add auto-reply if enabled)
    const twiML = new twilio.twiml.MessagingResponse();
    
    // Check if auto-reply is enabled
    if (twilioSettings.exists && twilioSettings.data().autoReplyEnabled) {
      twiML.message('Thank you for your message. We will get back to you soon.');
    }
    
    res.type('text/xml');
    res.send(twiML.toString());
  } catch (error) {
    console.error('Error processing Twilio webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * Send SMS message (callable function)
 */
exports.sendSms = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { agencyId, customerId, body } = data;
  
  if (!agencyId || !customerId || !body) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  // Verify user has access to agency
  const userRef = db.collection('agencies').doc(agencyId).collection('users').doc(context.auth.uid);
  const userSnap = await userRef.get();
  
  if (!userSnap.exists) {
    throw new functions.https.HttpsError('permission-denied', 'User does not have access to this agency');
  }
  
  const userData = userSnap.data();
  const role = userData.role;
  
  // Only agents and admins can send SMS
  if (role !== 'admin' && role !== 'agent') {
    throw new functions.https.HttpsError('permission-denied', 'Only agents and admins can send SMS');
  }
  
  if (!twilioClient) {
    throw new functions.https.HttpsError('failed-precondition', 'Twilio not configured');
  }
  
  try {
    // Get customer
    const customerRef = db.collection('agencies').doc(agencyId).collection('customers').doc(customerId);
    const customerSnap = await customerRef.get();
    
    if (!customerSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Customer not found');
    }
    
    const customer = customerSnap.data();
    
    if (!customer.phoneE164) {
      throw new functions.https.HttpsError('invalid-argument', 'Customer does not have a phone number');
    }
    
    // Get Twilio settings
    const twilioSettingsRef = db.collection('agencies').doc(agencyId).collection('settings').doc('twilio');
    const twilioSettings = await twilioSettingsRef.get();
    
    if (!twilioSettings.exists || !twilioSettings.data().twilioNumber) {
      throw new functions.https.HttpsError('failed-precondition', 'Twilio number not configured');
    }
    
    const twilioNumber = twilioSettings.data().twilioNumber;
    
    // Send SMS via Twilio
    const message = await twilioClient.messages.create({
      body: body,
      from: twilioNumber,
      to: customer.phoneE164,
    });
    
    // Get or create conversation
    const conversation = await getOrCreateConversation(agencyId, customerId, customer.phoneE164, twilioNumber);
    
    // Add message to conversation
    const messagesRef = db.collection('agencies').doc(agencyId)
      .collection('conversations').doc(conversation.id)
      .collection('messages');
    
    const messageRef = messagesRef.doc();
    await messageRef.set({
      direction: 'outbound',
      body: body,
      fromE164: twilioNumber,
      toE164: customer.phoneE164,
      status: 'queued',
      twilioSid: message.sid,
      createdByUid: context.auth.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Update conversation
    const conversationRef = db.collection('agencies').doc(agencyId)
      .collection('conversations').doc(conversation.id);
    
    await conversationRef.update({
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageSnippet: body.substring(0, 100),
    });
    
    // Update customer
    await customerRef.update({
      lastContactAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageSnippet: body.substring(0, 100),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return {
      success: true,
      messageSid: message.sid,
    };
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to send SMS');
  }
});

/**
 * Twilio status callback webhook (optional)
 */
exports.twilioStatusCallback = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }
  
  try {
    const messageSid = req.body.MessageSid;
    const status = req.body.MessageStatus;
    
    if (!messageSid || !status) {
      return res.status(400).send('Missing required fields');
    }
    
    // Find message by twilioSid and update status
    // This requires a query across all agencies/conversations/messages
    // For production, consider maintaining a messages index
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing status callback:', error);
    res.status(500).send('Internal Server Error');
  }
});
