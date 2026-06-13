// Placeholder for Stripe webhook handling.
// If your bot host cannot expose HTTP routes, put this on Vercel/Render/Cloudflare Worker later.
module.exports = async function stripeWebhook(req, res) {
  res.statusCode = 501;
  res.end('Stripe webhook not implemented yet.');
};
