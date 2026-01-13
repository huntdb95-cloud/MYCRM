// functions/index.js - Firebase Cloud Functions for Twilio SMS + Voice integration

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const twilio = require('twilio');
const express = require('express');
const cors = require('cors');

admin.initializeApp();

const db = admin.firestore();
const app = express();

// Enable CORS for all routes
app.use(cors({ origin: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Get Twilio credentials from environment
const TWILIO_ACCOUNT_SID = functions.config().twilio?.account_sid || process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = functions.config().twilio?.auth_token || process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WEBHOOK_AUTH = functions.config().twilio?.webhook_auth || process.env.TWILIO_WEBHOOK_AUTH;

// Initialize Twilio client
let twilioClient = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  console.log('Twilio client initialized');
} else {
  console.warn('Twilio credentials not configured');
}

/**
 * Normalize phone number to E.164 format
 */
function normalizePhoneToE164(phone) {
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
 * Validate Twilio webhook signature
 */
function validateTwilioSignature(req, res, next) {
  if (!TWILIO_WEBHOOK_AUTH) {
    console.warn('Twilio webhook auth not configured, skipping signature validation');
    return next();
  }
  
  const signature = req.headers['x-twilio-signature'];
  const url = req.protocol + '://' + req.get('host') + req.originalUrl;
  
  if (!signature) {
    console.warn('Missing Twilio signature');
    return res.status(403).send('Forbidden');
  }
  
  const params = req.body;
  const isValid = twilio.validateRequest(
    TWILIO_WEBHOOK_AUTH,
    signature,
    url,
    params
  );
  
  if (!isValid) {
    console.warn('Invalid Twilio signature');
    return res.status(403).send('Forbidden');
  }
  
  next();
}

/**
 * Get or create default agency
 * Returns agency document snapshot with .id and .data() methods
 */
async function getDefaultAgency() {
  const agenciesRef = db.collection('agencies');
  const defaultAgencyQuery = await agenciesRef.where('isDefault', '==', true).limit(1).get();
  
  if (!defaultAgencyQuery.empty) {
    return defaultAgencyQuery.docs[0];
  }
  
  // Create default agency
  const newAgencyRef = agenciesRef.doc();
  const agencyId = newAgencyRef.id;
  await newAgencyRef.set({
    name: 'Default Agency',
    isDefault: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  // Return as a doc-like object
  const newAgencySnap = await newAgencyRef.get();
  return newAgencySnap;
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
async function getOrCreateConversation(agencyId, customerId, phoneE164, twilioNumberE164) {
  const conversationsRef = db.collection('agencies').doc(agencyId).collection('conversations');
  
  // Try to find existing conversation
  const existingQuery = await conversationsRef
    .where('customerId', '==', customerId)
    .where('twilioNumberE164', '==', twilioNumberE164)
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
    twilioNumberE164: twilioNumberE164,
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
 * Get Twilio settings for agency
 */
async function getTwilioSettings(agencyId) {
  const settingsRef = db.collection('agencies').doc(agencyId).collection('settings').doc('twilio');
  const settingsSnap = await settingsRef.get();
  
  if (!settingsSnap.exists) {
    // Return defaults
    return {
      twilioNumberE164: '+16158088559',
      voice: {
        forwardToE164: null,
        voicemailEnabled: true,
        businessName: 'BookAutomated'
      },
      sms: {
        autoReplyEnabled: false,
        autoReplyText: 'Thanks! We received your message and will respond soon.'
      }
    };
  }
  
  return settingsSnap.data();
}

// ============================================================================
// INBOUND SMS WEBHOOK
// ============================================================================
app.post('/twilio/sms', validateTwilioSignature, async (req, res) => {
  try {
    console.log('Inbound SMS received:', {
      From: req.body.From,
      To: req.body.To,
      Body: req.body.Body?.substring(0, 50),
      MessageSid: req.body.MessageSid
    });
    
    const fromPhone = req.body.From;
    const toPhone = req.body.To;
    const body = req.body.Body || '';
    const messageSid = req.body.MessageSid;
    
    if (!fromPhone || !toPhone || !messageSid) {
      return res.status(400).send('Missing required fields');
    }
    
    // Normalize phone numbers
    const fromE164 = normalizePhoneToE164(fromPhone);
    const toE164 = normalizePhoneToE164(toPhone);
    
    if (!fromE164 || !toE164) {
      console.error('Invalid phone number format:', { fromPhone, toPhone });
      return res.status(400).send('Invalid phone number format');
    }
    
    // Get default agency
    const agencyDoc = await getDefaultAgency();
    const agencyId = agencyDoc.id;
    
    // Get Twilio settings
    const twilioSettings = await getTwilioSettings(agencyId);
    
    // Find or create customer
    let customer = await findCustomerByPhone(agencyId, fromE164);
    
    if (!customer) {
      customer = await createLeadFromPhone(agencyId, fromE164);
      console.log('Created new lead customer:', customer.id);
    }
    
    // Get or create conversation
    const conversation = await getOrCreateConversation(agencyId, customer.id, fromE164, toE164);
    
    // Add message to conversation
    const messagesRef = db.collection('agencies').doc(agencyId)
      .collection('conversations').doc(conversation.id)
      .collection('messages');
    
    const messageRef = messagesRef.doc();
    const messageData = {
      direction: 'inbound',
      body: body,
      fromE164: fromE164,
      toE164: toE164,
      status: 'received',
      twilioSid: messageSid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    await messageRef.set(messageData);
    
    // Update conversation
    const conversationRef = db.collection('agencies').doc(agencyId)
      .collection('conversations').doc(conversation.id);
    
    const snippet = body.substring(0, 120);
    await conversationRef.update({
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageSnippet: snippet,
      [`unreadCountByUid.${customer.assignedToUid || 'all'}`]: admin.firestore.FieldValue.increment(1),
    });
    
    // Update customer
    const customerRef = db.collection('agencies').doc(agencyId)
      .collection('customers').doc(customer.id);
    
    await customerRef.update({
      lastContactAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageSnippet: snippet,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Return TwiML response
    const twiml = new twilio.twiml.MessagingResponse();
    
    if (twilioSettings.sms?.autoReplyEnabled) {
      twiml.message(twilioSettings.sms.autoReplyText || 'Thanks! We received your message and will respond soon.');
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error('Error processing inbound SMS:', error);
    res.status(500).send('Internal Server Error');
  }
});

// ============================================================================
// INBOUND VOICE WEBHOOK
// ============================================================================
app.post('/twilio/voice', validateTwilioSignature, async (req, res) => {
  try {
    console.log('Inbound call received:', {
      From: req.body.From,
      To: req.body.To,
      CallSid: req.body.CallSid
    });
    
    const fromPhone = req.body.From;
    const toPhone = req.body.To;
    const callSid = req.body.CallSid;
    
    if (!fromPhone || !toPhone || !callSid) {
      return res.status(400).send('Missing required fields');
    }
    
    // Normalize phone numbers
    const fromE164 = normalizePhoneToE164(fromPhone);
    const toE164 = normalizePhoneToE164(toPhone);
    
    if (!fromE164 || !toE164) {
      return res.status(400).send('Invalid phone number format');
    }
    
    // Get default agency
    const agencyDoc = await getDefaultAgency();
    const agencyId = agencyDoc.id;
    
    // Get Twilio settings
    const twilioSettings = await getTwilioSettings(agencyId);
    const businessName = twilioSettings.voice?.businessName || 'BookAutomated';
    
    // Create call record
    const callsRef = db.collection('agencies').doc(agencyId).collection('calls');
    const callRef = callsRef.doc();
    await callRef.set({
      fromE164: fromE164,
      toE164: toE164,
      twilioCallSid: callSid,
      status: 'ringing',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      customerId: null, // Will be updated if customer found
      ivrSelection: null,
      notes: null,
    });
    
    // Try to find customer
    const customer = await findCustomerByPhone(agencyId, fromE164);
    if (customer) {
      await callRef.update({ customerId: customer.id });
    }
    
    // Generate TwiML for IVR
    const twiml = new twilio.twiml.VoiceResponse();
    const gather = twiml.gather({
      numDigits: 1,
      action: '/twilio/voice/gather',
      method: 'POST',
      timeout: 6,
      actionOnEmptyResult: true
    });
    
    gather.say(
      `Thanks for calling ${businessName}. ` +
      `If you're calling about billing, press 1. ` +
      `Policy changes, press 2. ` +
      `Claims, press 3. ` +
      `Or press 0 to leave a voicemail.`
    );
    
    // If no input, repeat once then go to voicemail
    twiml.say('I didn\'t receive your selection. Please leave a message after the tone.');
    twiml.redirect('/twilio/voice/voicemail');
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error('Error processing inbound voice:', error);
    res.status(500).send('Internal Server Error');
  }
});

// ============================================================================
// VOICE GATHER HANDLER (IVR keypress)
// ============================================================================
app.post('/twilio/voice/gather', validateTwilioSignature, async (req, res) => {
  try {
    const digits = req.body.Digits;
    const callSid = req.body.CallSid;
    const fromPhone = req.body.From;
    const toPhone = req.body.To;
    
    console.log('IVR selection received:', { digits, callSid });
    
    // Normalize phone numbers
    const fromE164 = normalizePhoneToE164(fromPhone);
    const toE164 = normalizePhoneToE164(toPhone);
    
    // Get default agency
    const agencyDoc = await getDefaultAgency();
    const agencyId = agencyDoc.id;
    
    // Get Twilio settings
    const twilioSettings = await getTwilioSettings(agencyId);
    const forwardToE164 = twilioSettings.voice?.forwardToE164;
    
    // Find call record
    const callsRef = db.collection('agencies').doc(agencyId).collection('calls');
    const callQuery = await callsRef.where('twilioCallSid', '==', callSid).limit(1).get();
    
    if (!callQuery.empty) {
      await callQuery.docs[0].ref.update({
        ivrSelection: digits,
        status: 'in-progress'
      });
    }
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Handle IVR selection
    if (digits === '1' || digits === '2' || digits === '3') {
      if (forwardToE164) {
        // Forward call
        twiml.say('Please hold while we connect you.');
        const dial = twiml.dial({
          callerId: toE164
        });
        dial.number(forwardToE164);
      } else {
        // No forwarding configured, go to voicemail
        twiml.say('We received your request. Please leave a message after the tone.');
        twiml.redirect('/twilio/voice/voicemail');
      }
    } else if (digits === '0' || !digits) {
      // Go to voicemail
      twiml.redirect('/twilio/voice/voicemail');
    } else {
      // Invalid selection, go to voicemail
      twiml.say('Invalid selection. Please leave a message after the tone.');
      twiml.redirect('/twilio/voice/voicemail');
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error('Error processing IVR gather:', error);
    res.status(500).send('Internal Server Error');
  }
});

// ============================================================================
// VOICEMAIL HANDLER
// ============================================================================
app.post('/twilio/voice/voicemail', validateTwilioSignature, async (req, res) => {
  try {
    const callSid = req.body.CallSid;
    const fromPhone = req.body.From;
    const toPhone = req.body.To;
    
    console.log('Voicemail recording initiated:', { callSid, fromPhone });
    
    // Normalize phone numbers
    const fromE164 = normalizePhoneToE164(fromPhone);
    const toE164 = normalizePhoneToE164(toPhone);
    
    // Get default agency
    const agencyDoc = await getDefaultAgency();
    const agencyId = agencyDoc.id;
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Please leave your message after the tone.');
    
    const record = twiml.record({
      action: '/twilio/voice/voicemail/complete',
      method: 'POST',
      maxLength: 120,
      playBeep: true,
      recordingStatusCallback: '/twilio/voice/voicemail/recording',
      recordingStatusCallbackMethod: 'POST'
    });
    
    twiml.say('I did not receive a recording.');
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error('Error processing voicemail:', error);
    res.status(500).send('Internal Server Error');
  }
});

// ============================================================================
// VOICEMAIL RECORDING COMPLETE
// ============================================================================
app.post('/twilio/voice/voicemail/complete', validateTwilioSignature, async (req, res) => {
  try {
    const callSid = req.body.CallSid;
    const fromPhone = req.body.From;
    const recordingUrl = req.body.RecordingUrl;
    const recordingSid = req.body.RecordingSid;
    
    console.log('Voicemail recording completed:', { callSid, recordingSid });
    
    // Normalize phone numbers
    const fromE164 = normalizePhoneToE164(fromPhone);
    
    // Get default agency
    const agencyDoc = await getDefaultAgency();
    const agencyId = agencyDoc.id;
    
    // Find or create customer
    let customer = await findCustomerByPhone(agencyId, fromE164);
    if (!customer) {
      customer = await createLeadFromPhone(agencyId, fromE164);
    }
    
    // Update call record
    const callsRef = db.collection('agencies').doc(agencyId).collection('calls');
    const callQuery = await callsRef.where('twilioCallSid', '==', callSid).limit(1).get();
    
    if (!callQuery.empty) {
      await callQuery.docs[0].ref.update({
        recordingUrl: recordingUrl,
        recordingSid: recordingSid,
        customerId: customer.id,
        status: 'completed',
        endedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    // Create follow-up task
    const tasksRef = db.collection('agencies').doc(agencyId).collection('tasks');
    const taskRef = tasksRef.doc();
    
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1); // Due in 1 day
    
    await taskRef.set({
      title: 'Voicemail received',
      description: `Voicemail from ${fromE164}${customer.fullName !== 'Unknown' ? ` (${customer.fullName})` : ''}. Recording: ${recordingUrl}`,
      dueAt: admin.firestore.Timestamp.fromDate(dueDate),
      priority: 'high',
      status: 'open',
      customerId: customer.id,
      assignedToUid: customer.assignedToUid || null,
      createdByUid: null, // System created
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Thank you for your message. We will return your call as soon as possible. Goodbye.');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error('Error processing voicemail complete:', error);
    res.status(500).send('Internal Server Error');
  }
});

// ============================================================================
// VOICEMAIL RECORDING STATUS CALLBACK
// ============================================================================
app.post('/twilio/voice/voicemail/recording', validateTwilioSignature, async (req, res) => {
  // This is called when recording is available
  // We already handle it in the complete handler, so just acknowledge
  res.status(200).send('OK');
});

// ============================================================================
// SMS DELIVERY STATUS CALLBACK
// ============================================================================
app.post('/twilio/status/sms', validateTwilioSignature, async (req, res) => {
  try {
    const messageSid = req.body.MessageSid;
    const messageStatus = req.body.MessageStatus;
    
    console.log('SMS status update:', { messageSid, messageStatus });
    
    if (!messageSid || !messageStatus) {
      return res.status(400).send('Missing required fields');
    }
    
    // Get default agency
    const agencyDoc = await getDefaultAgency();
    const agencyId = agencyDoc.id;
    
    // Find message by twilioSid across all conversations
    // Note: This requires querying all conversations, which is not ideal
    // For production, consider maintaining a messages index
    const conversationsRef = db.collection('agencies').doc(agencyId).collection('conversations');
    const conversationsSnapshot = await conversationsRef.get();
    
    for (const convDoc of conversationsSnapshot.docs) {
      const messagesRef = convDoc.ref.collection('messages');
      const messageQuery = await messagesRef.where('twilioSid', '==', messageSid).limit(1).get();
      
      if (!messageQuery.empty) {
        await messageQuery.docs[0].ref.update({
          status: messageStatus,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log('Updated message status:', messageSid, messageStatus);
        break;
      }
    }
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error('Error processing SMS status:', error);
    res.status(500).send('Internal Server Error');
  }
});

// ============================================================================
// OUTBOUND SMS (Callable Function)
// ============================================================================
exports.sendSms = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { agencyId, customerId, phoneE164, body } = data;
  
  if (!agencyId || !body) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: agencyId, body');
  }
  
  if (!customerId && !phoneE164) {
    throw new functions.https.HttpsError('invalid-argument', 'Must provide either customerId or phoneE164');
  }
  
  if (!twilioClient) {
    throw new functions.https.HttpsError('failed-precondition', 'Twilio not configured');
  }
  
  try {
    // Verify user has access to agency
    const userRef = db.collection('agencies').doc(agencyId).collection('users').doc(context.auth.uid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      throw new functions.https.HttpsError('permission-denied', 'User does not have access to this agency');
    }
    
    const userData = userSnap.data();
    const role = userData.role;
    
    // Only agents and admins can send SMS (assistants optionally allowed)
    if (role !== 'admin' && role !== 'agent') {
      throw new functions.https.HttpsError('permission-denied', 'Only agents and admins can send SMS');
    }
    
    // Get customer if customerId provided
    let customer = null;
    let targetPhoneE164 = phoneE164;
    
    if (customerId) {
      const customerRef = db.collection('agencies').doc(agencyId).collection('customers').doc(customerId);
      const customerSnap = await customerRef.get();
      
      if (!customerSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Customer not found');
      }
      
      customer = { id: customerSnap.id, ...customerSnap.data() };
      targetPhoneE164 = customer.phoneE164;
    }
    
    if (!targetPhoneE164) {
      throw new functions.https.HttpsError('invalid-argument', 'Customer does not have a phone number');
    }
    
    // Normalize phone
    const normalizedPhone = normalizePhoneToE164(targetPhoneE164);
    if (!normalizedPhone) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid phone number format');
    }
    
    // Get Twilio settings
    const twilioSettings = await getTwilioSettings(agencyId);
    const twilioNumberE164 = twilioSettings.twilioNumberE164 || '+16158088559';
    
    // Send SMS via Twilio
    const message = await twilioClient.messages.create({
      body: body,
      from: twilioNumberE164,
      to: normalizedPhone,
      statusCallback: 'https://bookautomated.com/twilio/status/sms'
    });
    
    console.log('SMS sent:', { messageSid: message.sid, to: normalizedPhone });
    
    // If customerId provided, update customer and conversation
    if (customerId && customer) {
      // Get or create conversation
      const conversation = await getOrCreateConversation(agencyId, customer.id, normalizedPhone, twilioNumberE164);
      
      // Add message to conversation
      const messagesRef = db.collection('agencies').doc(agencyId)
        .collection('conversations').doc(conversation.id)
        .collection('messages');
      
      const messageRef = messagesRef.doc();
      await messageRef.set({
        direction: 'outbound',
        body: body,
        fromE164: twilioNumberE164,
        toE164: normalizedPhone,
        status: 'queued',
        twilioSid: message.sid,
        createdByUid: context.auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // Update conversation
      const conversationRef = db.collection('agencies').doc(agencyId)
        .collection('conversations').doc(conversation.id);
      
      const snippet = body.substring(0, 120);
      await conversationRef.update({
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessageSnippet: snippet,
      });
      
      // Update customer
      const customerRef = db.collection('agencies').doc(agencyId)
        .collection('customers').doc(customer.id);
      
      await customerRef.update({
        lastContactAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessageSnippet: snippet,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    
    return {
      success: true,
      messageSid: message.sid,
      status: message.status
    };
    
  } catch (error) {
    console.error('Error sending SMS:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'Failed to send SMS');
  }
});

// Export Express app as Firebase Function
exports.twilio = functions.https.onRequest(app);
