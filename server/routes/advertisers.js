const express = require('express');
const router = express.Router();
const { getActiveAdvertisers, getOrCreateAdvertiser, updateAdvertiserLogo } = require('../db');
const axios = require('axios');

// Get all active advertisers (for rotating ads)
router.get('/api/advertisers', async (req, res) => {
  try {
    const advertisers = await getActiveAdvertisers();
    
    // If no advertisers in DB, seed with default list
    if (advertisers.length === 0) {
      const defaultAdvertisers = [
        { name: 'Stripe', domain: 'stripe.com', description: 'Payment processing for the internet. Hiring engineers, designers, and more.', websiteUrl: 'https://stripe.com/jobs' },
        { name: 'Vercel', domain: 'vercel.com', description: 'Deploy web projects with the best developer experience. Frontend engineers wanted.', websiteUrl: 'https://vercel.com/careers' },
        { name: 'Notion', domain: 'notion.so', description: 'All-in-one workspace. Hiring product managers, engineers, and designers.', websiteUrl: 'https://notion.so/careers' },
        { name: 'Linear', domain: 'linear.app', description: 'The issue tracking tool you\'ll enjoy using. Hiring across all teams.', websiteUrl: 'https://linear.app/careers' },
        { name: 'Figma', domain: 'figma.com', description: 'Design, prototype, and collaborate. Hiring designers and engineers.', websiteUrl: 'https://figma.com/careers' },
        { name: 'GitHub', domain: 'github.com', description: 'Where the world builds software. Open positions in engineering and product.', websiteUrl: 'https://github.com/careers' },
        { name: 'OpenAI', domain: 'openai.com', description: 'Building safe AGI. Hiring researchers, engineers, and product managers.', websiteUrl: 'https://openai.com/careers' },
        { name: 'Anthropic', domain: 'anthropic.com', description: 'AI safety and research company. Hiring across research and engineering.', websiteUrl: 'https://anthropic.com/careers' },
        { name: 'Resend', domain: 'resend.com', description: 'Email API for developers. Hiring engineers and product builders.', websiteUrl: 'https://resend.com/careers' },
        { name: 'Supabase', domain: 'supabase.com', description: 'Open source Firebase alternative. Hiring engineers and developers.', websiteUrl: 'https://supabase.com/careers' },
        { name: 'Railway', domain: 'railway.app', description: 'Deploy apps with ease. Hiring engineers and product managers.', websiteUrl: 'https://railway.app/careers' },
        { name: 'PlanetScale', domain: 'planetscale.com', description: 'MySQL-compatible serverless database. Hiring database engineers.', websiteUrl: 'https://planetscale.com/careers' },
        { name: 'Cloudflare', domain: 'cloudflare.com', description: 'Building a better internet. Hiring across engineering and product.', websiteUrl: 'https://cloudflare.com/careers' },
        { name: 'Datadog', domain: 'datadoghq.com', description: 'Monitoring and security platform. Hiring engineers and SREs.', websiteUrl: 'https://datadoghq.com/careers' },
        { name: 'Twilio', domain: 'twilio.com', description: 'Communication APIs for developers. Hiring engineers and product managers.', websiteUrl: 'https://twilio.com/careers' },
        { name: 'Shopify', domain: 'shopify.com', description: 'Commerce platform. Hiring engineers, designers, and product managers.', websiteUrl: 'https://shopify.com/careers' },
        { name: 'Airbnb', domain: 'airbnb.com', description: 'Travel and experiences platform. Hiring across all teams.', websiteUrl: 'https://airbnb.com/careers' },
        { name: 'Netflix', domain: 'netflix.com', description: 'Entertainment streaming platform. Hiring engineers and content creators.', websiteUrl: 'https://netflix.com/careers' },
        { name: 'Meta', domain: 'meta.com', description: 'Building the metaverse. Hiring engineers, researchers, and designers.', websiteUrl: 'https://meta.com/careers' },
        { name: 'Amazon', domain: 'amazon.com', description: 'E-commerce and cloud computing. Hiring across all engineering teams.', websiteUrl: 'https://amazon.jobs' }
      ];
      
      // Create all advertisers
      for (const ad of defaultAdvertisers) {
        await getOrCreateAdvertiser(ad.name, ad.domain, ad.description, ad.websiteUrl);
      }
      
      // Fetch logos for all and cache them
      const createdAdvertisers = await getActiveAdvertisers();
      for (const ad of createdAdvertisers) {
        if (!ad.logo_url) {
          try {
            // Try clearbit first
            const logoUrl = `https://logo.clearbit.com/${ad.domain}`;
            const response = await axios.get(logoUrl, { 
              timeout: 3000, 
              validateStatus: (status) => status < 500,
              responseType: 'arraybuffer'
            });
            
            if (response.status === 200 && response.data) {
              const contentType = response.headers['content-type'] || '';
              if (contentType.startsWith('image/')) {
                await updateAdvertiserLogo(ad.domain, logoUrl);
                console.log(`✅ Cached logo for ${ad.domain}: ${logoUrl}`);
              }
            }
          } catch (error) {
            // Logo fetch failed, will try again next time
            console.log(`⚠️ Could not fetch logo for ${ad.domain}, will retry later`);
          }
        }
      }
      
      // Return the newly created advertisers
      return res.json(await getActiveAdvertisers());
    }
    
    res.json(advertisers);
  } catch (error) {
    console.error('Error fetching advertisers:', error);
    res.status(500).json({ error: 'Failed to fetch advertisers' });
  }
});

module.exports = router;




