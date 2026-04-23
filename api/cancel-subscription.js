// API pour annuler un abonnement Stripe
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    const { userId } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Récupérer l'abonnement de l'utilisateur
    const { data: subscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, plan')
      .eq('user_id', userId)
      .single();

    if (fetchError || !subscription) {
      return new Response(JSON.stringify({ error: 'Subscription not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Vérifier qu'il y a bien un abonnement Stripe
    if (!subscription.stripe_subscription_id) {
      return new Response(JSON.stringify({ error: 'No active Stripe subscription' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Annuler l'abonnement dans Stripe
    const canceledSubscription = await stripe.subscriptions.cancel(
      subscription.stripe_subscription_id
    );

    // Mettre à jour dans Supabase
    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        plan: 'free',
        generations_limit: 10,
        status: 'canceled',
        stripe_subscription_id: null,
        stripe_customer_id: null,
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Error updating subscription:', updateError);
      return new Response(JSON.stringify({ error: 'Database update failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Subscription canceled successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Cancel subscription error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
