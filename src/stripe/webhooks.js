'use strict';

function createWebhookModule(stripe) {
  function constructEvent(rawBody, signature) {
    return stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  }

  const handlers = {
    'checkout.session.completed': async (event) => {
      const session = event.data.object;
      console.log(`[stripe] Checkout completed: customer=${session.customer}, tier=${session.metadata.tier}`);
      return {
        action: 'provision',
        customerId: session.customer,
        subscriptionId: session.subscription,
        tier: session.metadata.tier,
        agentLimit: parseInt(session.metadata.agent_limit, 10),
      };
    },

    'customer.subscription.updated': async (event) => {
      const subscription = event.data.object;
      console.log(`[stripe] Subscription updated: ${subscription.id}, status=${subscription.status}`);
      return {
        action: 'update',
        subscriptionId: subscription.id,
        status: subscription.status,
        customerId: subscription.customer,
      };
    },

    'customer.subscription.deleted': async (event) => {
      const subscription = event.data.object;
      console.log(`[stripe] Subscription cancelled: ${subscription.id}`);
      return {
        action: 'deprovision',
        subscriptionId: subscription.id,
        customerId: subscription.customer,
      };
    },

    'invoice.payment_failed': async (event) => {
      const invoice = event.data.object;
      console.log(`[stripe] Payment failed: invoice=${invoice.id}, customer=${invoice.customer}`);
      return {
        action: 'payment_failed',
        invoiceId: invoice.id,
        customerId: invoice.customer,
        attemptCount: invoice.attempt_count,
      };
    },

    'invoice.paid': async (event) => {
      const invoice = event.data.object;
      console.log(`[stripe] Invoice paid: ${invoice.id}, amount=${invoice.amount_paid}`);
      return {
        action: 'payment_succeeded',
        invoiceId: invoice.id,
        customerId: invoice.customer,
        amountPaid: invoice.amount_paid,
      };
    },
  };

  async function handleEvent(event) {
    const handler = handlers[event.type];
    if (!handler) {
      console.log(`[stripe] Unhandled event type: ${event.type}`);
      return { action: 'ignored', eventType: event.type };
    }
    return handler(event);
  }

  return { constructEvent, handleEvent, handlers };
}

module.exports = { createWebhookModule };
