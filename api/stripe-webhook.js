// Webhook Stripe pour gérer les paiements et mettre à jour Supabase
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { buffer } from 'micro';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('✅ Webhook event received:', event.type);

  // Gérer l'événement
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        console.log('📦 Checkout completed for user:', userId, 'plan:', plan);

        if (!userId || !plan) {
          console.error('❌ Missing metadata in session');
          return res.status(400).json({ error: 'Missing metadata' });
        }

        // Mettre à jour l'abonnement dans Supabase
        const generationsLimit = plan === 'premium' ? 999999 : 100;
        
        const { data, error } = await supabase
          .from('subscriptions')
          .update({
            plan: plan,
            generations_limit: generationsLimit,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status: 'active',
          })
          .eq('user_id', userId);

        if (error) {
          console.error('❌ Error updating subscription:', error);
          return res.status(500).json({ error: 'Database error', details: error });
        }

        console.log('✅ Subscription updated successfully');
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        
        console.log('🔄 Subscription updated:', subscription.id);
        
        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: subscription.status,
          })
          .eq('stripe_subscription_id', subscription.id);

        if (error) {
          console.error('❌ Error updating subscription status:', error);
        } else {
          console.log('✅ Subscription status updated');
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        
        console.log('🗑️ Subscription deleted:', subscription.id);
        
        const { error } = await supabase
          .from('subscriptions')
          .update({
            plan: 'free',
            generations_limit: 10,
            status: 'canceled',
            stripe_subscription_id: null,
          })
          .eq('stripe_subscription_id', subscription.id);

        if (error) {
          console.error('❌ Error canceling subscription:', error);
        } else {
          console.log('✅ Subscription canceled successfully');
        }
        break;
      }

      default:
        console.log('ℹ️ Unhandled event type:', event.type);
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    return res.status(500).json({ error: error.message });
  }
}
