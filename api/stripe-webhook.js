// Webhook Stripe en Edge runtime - met à jour Supabase après paiement
export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rgaftjkxcjxudobfiyyo.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

async function supabaseFetch(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

// Vérification signature Stripe (Edge-compatible, sans la lib Stripe)
async function verifyStripeSignature(payload, signature, secret) {
  const elements = signature.split(',').reduce((acc, el) => {
    const [key, value] = el.split('=');
    acc[key] = value;
    return acc;
  }, {});

  const timestamp = elements.t;
  const sig = elements.v1;
  if (!timestamp || !sig) throw new Error('Invalid signature format');

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const expectedSig = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  if (expectedSig !== sig) throw new Error('Signature mismatch');
  return true;
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response(JSON.stringify({ error: 'No signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload;
  let event;
  try {
    payload = await req.text();
    await verifyStripeSignature(payload, signature, STRIPE_WEBHOOK_SECRET);
    event = JSON.parse(payload);
  } catch (err) {
    console.error('❌ Webhook verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log('✅ Webhook event:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (!userId || !plan) {
          console.error('❌ Missing metadata');
          return new Response(JSON.stringify({ error: 'Missing metadata' }), { status: 400 });
        }

        const generationsLimit = plan === 'premium' ? 999999 : 999999;
        const updateRes = await supabaseFetch(`/subscriptions?user_id=eq.${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            plan: plan,
            generations_limit: generationsLimit,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status: 'active',
          }),
        });

        if (!updateRes.ok) {
          const err = await updateRes.text();
          console.error('❌ Supabase update failed:', err);
          return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
        }

        console.log(`✅ User ${userId} upgraded to ${plan}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await supabaseFetch(`/subscriptions?stripe_subscription_id=eq.${subscription.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: subscription.status }),
        });
        console.log(`🔄 Subscription ${subscription.id} status: ${subscription.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await supabaseFetch(`/subscriptions?stripe_subscription_id=eq.${subscription.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            plan: 'free',
            generations_limit: 10,
            status: 'canceled',
            stripe_subscription_id: null,
          }),
        });
        console.log(`🗑️ Subscription ${subscription.id} canceled, user back to free`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          await supabaseFetch(`/subscriptions?stripe_subscription_id=eq.${invoice.subscription}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'past_due' }),
          });
          console.log(`⚠️ Payment failed for subscription ${invoice.subscription}`);
        }
        break;
      }

      default:
        console.log('ℹ️ Unhandled event type:', event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
