// Vercel Function pour créer une session de paiement Stripe
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { priceId, userId, userEmail, plan } = await req.json();

    if (!priceId || !userId || !userEmail) {
      return new Response(JSON.stringify({ error: 'Missing parameters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Créer une session de paiement Stripe
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `https://postly.agency/dashboard.html?success=true&plan=${plan}`,
      cancel_url: `https://postly.agency/dashboard.html?canceled=true`,
      customer_email: userEmail,
      metadata: {
        userId: userId,
        plan: plan,
      },
      subscription_data: {
        metadata: {
          userId: userId,
          plan: plan,
        },
      },
    });

    return new Response(JSON.stringify({ sessionId: session.id, url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Stripe error:', error);
    return new Response(JSON.stringify({ 
      error: 'Payment error',
      message: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
