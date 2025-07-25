import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig!, endpointSecret)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session
      console.log('Payment succeeded for session:', session.id)

      // Here you would typically:
      // 1. Update the order status in Medusa
      // 2. Send confirmation emails
      // 3. Update inventory
      // 4. etc.

      try {
        // Update the order in Medusa backend
        const cartId = session.metadata?.cartId
        if (cartId) {
          // Call Medusa API to complete the order
          const medusaResponse = await fetch(`${process.env.MEDUSA_BACKEND_URL}/store/carts/${cartId}/complete`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              payment_session: {
                provider_id: session.metadata?.paymentProviderId || 'stripe',
                data: {
                  session_id: session.id,
                  payment_intent: session.payment_intent,
                }
              }
            })
          })

          if (!medusaResponse.ok) {
            console.error('Failed to complete order in Medusa:', await medusaResponse.text())
          }
        }
      } catch (error) {
        console.error('Error processing checkout completion:', error)
      }
      break

    case 'checkout.session.expired':
      const expiredSession = event.data.object as Stripe.Checkout.Session
      console.log('Checkout session expired:', expiredSession.id)
      break

    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      console.log('PaymentIntent succeeded:', paymentIntent.id)
      break

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object as Stripe.PaymentIntent
      console.log('PaymentIntent failed:', failedPayment.id)
      break

    default:
      console.log(`Unhandled event type: ${event.type}`)
  }

  return NextResponse.json({ received: true })
} 