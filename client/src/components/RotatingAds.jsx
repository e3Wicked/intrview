import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import './RotatingAds.css'
import SponsorModal from './SponsorModal'

// Logo component with multiple fallback options
function LogoWithFallbacks({ domain, name, logoUrl }) {
  const [currentSrc, setCurrentSrc] = useState(null)
  const [showPlaceholder, setShowPlaceholder] = useState(false)
  
  // Build fallback chain: try multiple logo services
  const getLogoUrls = () => {
    const urls = []
    
    // 1. Use provided logoUrl if it exists and isn't clearbit
    if (logoUrl && !logoUrl.includes('clearbit.com')) {
      urls.push(logoUrl)
    }
    
    // 2. Google Favicon API (high quality, works well)
    if (domain) {
      urls.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`)
    }
    
    // 3. DuckDuckGo icons
    if (domain) {
      urls.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`)
    }
    
    // 4. logo.dev
    if (domain) {
      urls.push(`https://logo.dev/${domain}`)
    }
    
    // 5. Direct favicon from domain
    if (domain) {
      urls.push(`https://${domain}/favicon.ico`)
    }
    
    // 6. Clearbit (last resort, might be blocked)
    if (domain) {
      urls.push(`https://logo.clearbit.com/${domain}`)
    }
    
    return urls
  }
  
  useEffect(() => {
    const urls = getLogoUrls()
    if (urls.length > 0) {
      setCurrentSrc(urls[0])
      setShowPlaceholder(false)
    } else {
      setShowPlaceholder(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, logoUrl])
  
  const handleError = () => {
    const urls = getLogoUrls()
    const currentIndex = urls.indexOf(currentSrc)
    
    if (currentIndex < urls.length - 1) {
      // Try next fallback
      setCurrentSrc(urls[currentIndex + 1])
    } else {
      // All failed, show placeholder
      setShowPlaceholder(true)
    }
  }
  
  if (showPlaceholder) {
    return (
      <div className="logo-placeholder">
        {(name || '?').charAt(0).toUpperCase()}
      </div>
    )
  }
  
  return (
    <img 
      src={currentSrc}
      alt={name || 'Company'}
      className="rotating-ad-logo"
      onError={handleError}
      onLoad={() => setShowPlaceholder(false)}
    />
  )
}

// Fallback advertisers - matches server's defaultAdvertisers list
// This ensures frontend always has correct job counts and hiring status even if API returns 0/false
const FALLBACK_ADVERTISERS = [
  { id: 1, name: 'Replicate', domain: 'replicate.com', description: 'Run ML models in the cloud. Hiring ML engineers and infrastructure builders.', url: 'https://replicate.com/jobs', job_count: 8, is_actively_hiring: true },
  { id: 2, name: 'Modal', domain: 'modal.com', description: 'Serverless GPU platform. Hiring engineers and ML researchers.', url: 'https://modal.com/careers', job_count: 12, is_actively_hiring: true },
  { id: 3, name: 'Cursor', domain: 'cursor.sh', description: 'AI-powered code editor. Hiring engineers and product designers.', url: 'https://cursor.sh/careers', job_count: 6, is_actively_hiring: true },
  { id: 4, name: 'Hugging Face', domain: 'huggingface.co', description: 'Open source ML platform. Hiring researchers and engineers.', url: 'https://huggingface.co/jobs', job_count: 15, is_actively_hiring: true },
  { id: 5, name: 'Cohere', domain: 'cohere.com', description: 'Enterprise AI platform. Hiring ML engineers and researchers.', url: 'https://cohere.com/careers', job_count: 10, is_actively_hiring: true },
  { id: 6, name: 'Replit', domain: 'replit.com', description: 'Online IDE and hosting. Hiring engineers and designers.', url: 'https://replit.com/careers', job_count: 9, is_actively_hiring: true },
  { id: 7, name: 'Temporal', domain: 'temporal.io', description: 'Workflow orchestration platform. Hiring engineers and SREs.', url: 'https://temporal.io/careers', job_count: 7, is_actively_hiring: true },
  { id: 8, name: 'Clerk', domain: 'clerk.com', description: 'Authentication and user management. Hiring engineers and designers.', url: 'https://clerk.com/careers', job_count: 11, is_actively_hiring: true },
  { id: 9, name: 'Retool', domain: 'retool.com', description: 'Internal tool builder. Hiring engineers and product managers.', url: 'https://retool.com/careers', job_count: 14, is_actively_hiring: true },
  { id: 10, name: 'PostHog', domain: 'posthog.com', description: 'Product analytics platform. Hiring engineers and data scientists.', url: 'https://posthog.com/careers', job_count: 13, is_actively_hiring: true },
  { id: 11, name: 'Cal.com', domain: 'cal.com', description: 'Open source scheduling. Hiring engineers and designers.', url: 'https://cal.com/careers', job_count: 5, is_actively_hiring: true },
  { id: 12, name: 'Plausible', domain: 'plausible.io', description: 'Privacy-friendly analytics. Hiring engineers and marketers.', url: 'https://plausible.io/careers', job_count: 4, is_actively_hiring: false },
  { id: 13, name: 'Fathom', domain: 'usefathom.com', description: 'Privacy-first analytics. Hiring engineers and support.', url: 'https://usefathom.com/careers', job_count: 6, is_actively_hiring: true },
  { id: 14, name: 'Buttondown', domain: 'buttondown.email', description: 'Email newsletter platform. Hiring engineers and designers.', url: 'https://buttondown.email/careers', job_count: 3, is_actively_hiring: false },
  { id: 15, name: 'ConvertKit', domain: 'convertkit.com', description: 'Email marketing for creators. Hiring engineers and support.', url: 'https://convertkit.com/careers', job_count: 8, is_actively_hiring: true },
  { id: 16, name: 'Ghost', domain: 'ghost.org', description: 'Publishing platform. Hiring engineers and designers.', url: 'https://ghost.org/careers', job_count: 7, is_actively_hiring: true },
  { id: 17, name: 'Buffer', domain: 'buffer.com', description: 'Social media management. Hiring engineers and marketers.', url: 'https://buffer.com/jobs', job_count: 9, is_actively_hiring: true },
  { id: 18, name: 'Doppler', domain: 'doppler.com', description: 'Secrets management. Hiring engineers and SREs.', url: 'https://doppler.com/careers', job_count: 5, is_actively_hiring: true },
  { id: 19, name: 'Porter', domain: 'porter.run', description: 'Kubernetes platform. Hiring engineers and DevOps.', url: 'https://porter.run/careers', job_count: 6, is_actively_hiring: true },
  { id: 20, name: 'Render', domain: 'render.com', description: 'Cloud hosting platform. Hiring engineers and SREs.', url: 'https://render.com/careers', job_count: 10, is_actively_hiring: true },
  // Add all the companies from server's defaultAdvertisers that aren't in the list above
  { id: 21, name: 'Netflix', domain: 'netflix.com', description: 'Entertainment streaming platform. Hiring engineers and data scientists.', url: 'https://jobs.netflix.com', job_count: 25, is_actively_hiring: true },
  { id: 22, name: 'Airbnb', domain: 'airbnb.com', description: 'Travel and experiences platform. Hiring across all teams.', url: 'https://careers.airbnb.com', job_count: 18, is_actively_hiring: true },
  { id: 23, name: 'GitHub', domain: 'github.com', description: 'Where the world builds software. Open positions in engineering and product.', url: 'https://github.com/careers', job_count: 12, is_actively_hiring: true },
  { id: 24, name: 'Meta', domain: 'meta.com', description: 'Building the metaverse. Hiring engineers, researchers, and designers.', url: 'https://www.metacareers.com', job_count: 30, is_actively_hiring: true },
  { id: 25, name: 'Amazon', domain: 'amazon.com', description: 'E-commerce and cloud computing. Hiring across all engineering teams.', url: 'https://www.amazon.jobs', job_count: 50, is_actively_hiring: true },
  { id: 26, name: 'Supabase', domain: 'supabase.com', description: 'Open source Firebase alternative. Hiring engineers and developers.', url: 'https://supabase.com/careers', job_count: 8, is_actively_hiring: true },
  { id: 27, name: 'Cloudflare', domain: 'cloudflare.com', description: 'Web infrastructure and security. Hiring engineers and SREs.', url: 'https://www.cloudflare.com/careers', job_count: 15, is_actively_hiring: true },
  { id: 28, name: 'Railway', domain: 'railway.app', description: 'Deploy and scale applications. Hiring engineers and DevOps.', url: 'https://railway.app/careers', job_count: 6, is_actively_hiring: true },
  { id: 29, name: 'Resend', domain: 'resend.com', description: 'Email API for developers. Hiring engineers and product builders.', url: 'https://resend.com/careers', job_count: 5, is_actively_hiring: true },
  { id: 30, name: 'Stripe', domain: 'stripe.com', description: 'Payment processing for the internet. Hiring engineers, designers, and more.', url: 'https://stripe.com/jobs', job_count: 20, is_actively_hiring: true },
  { id: 31, name: 'Notion', domain: 'notion.so', description: 'All-in-one workspace. Hiring product managers, engineers, and designers.', url: 'https://notion.so/careers', job_count: 10, is_actively_hiring: true },
  { id: 32, name: 'Apple', domain: 'apple.com', description: 'Technology company. Hiring engineers, designers, and product managers.', url: 'https://jobs.apple.com', job_count: 40, is_actively_hiring: true },
  { id: 33, name: 'OpenAI', domain: 'openai.com', description: 'Building safe AGI. Hiring researchers, engineers, and product managers.', url: 'https://openai.com/careers', job_count: 15, is_actively_hiring: true },
  { id: 34, name: 'Anthropic', domain: 'anthropic.com', description: 'AI safety and research company. Hiring across research and engineering.', url: 'https://anthropic.com/careers', job_count: 12, is_actively_hiring: true },
  { id: 35, name: 'Shopify', domain: 'shopify.com', description: 'Commerce platform. Hiring engineers, designers, and product managers.', url: 'https://shopify.com/careers', job_count: 22, is_actively_hiring: true },
  { id: 36, name: 'Figma', domain: 'figma.com', description: 'Design, prototype, and collaborate. Hiring designers and engineers.', url: 'https://figma.com/careers', job_count: 14, is_actively_hiring: true },
  { id: 37, name: 'Linear', domain: 'linear.app', description: "The issue tracking tool you'll enjoy using. Hiring across all teams.", url: 'https://linear.app/careers', job_count: 8, is_actively_hiring: true },
  { id: 38, name: 'Twilio', domain: 'twilio.com', description: 'Communication APIs for developers. Hiring engineers and product managers.', url: 'https://twilio.com/careers', job_count: 16, is_actively_hiring: true },
  { id: 39, name: 'Vercel', domain: 'vercel.com', description: 'Deploy web projects with the best developer experience. Frontend engineers wanted.', url: 'https://vercel.com/careers', job_count: 11, is_actively_hiring: true },
  { id: 40, name: 'Datadog', domain: 'datadoghq.com', description: 'Monitoring and security platform. Hiring engineers and SREs.', url: 'https://datadoghq.com/careers', job_count: 13, is_actively_hiring: true },
  { id: 41, name: 'PlanetScale', domain: 'planetscale.com', description: 'MySQL-compatible serverless database. Hiring database engineers.', url: 'https://planetscale.com/careers', job_count: 7, is_actively_hiring: true }
]

const ROTATION_INTERVAL = 10000 // 10 seconds
const CARDS_TO_SHOW = 5 // 5 cards per sidebar (10 total visible - 5 left + 5 right)
const MOBILE_CARDS_TO_SHOW = 3 // 3 cards for mobile horizontal scroll

// Shared state for both sidebars to keep them synchronized
let sharedCurrentIndex = 0
let sharedRotationInterval = null
let rotationSubscribers = new Set()
let sharedUsedDomains = new Set() // Track domains currently displayed across both sidebars

function RotatingAds({ position = 'left' }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  // Initialize with fallback advertisers so ads are always visible, even during fetch
  const [advertisers, setAdvertisers] = useState(() => {
    // Remove duplicates from fallback immediately
    const uniqueFallback = []
    const seenDomains = new Set()
    for (const ad of FALLBACK_ADVERTISERS) {
      const rawDomain = ad.domain || ad.name?.toLowerCase()?.replace(/\s+/g, '') + '.com'
      const domain = rawDomain.toLowerCase().replace(/^www\./, '').trim()
      if (domain && !seenDomains.has(domain)) {
        seenDomains.add(domain)
        uniqueFallback.push(ad)
      }
    }
    // Don't shuffle - keep consistent order to prevent random re-renders
    return uniqueFallback
  })
  const [isRotating, setIsRotating] = useState(false)
  const [showSponsorModal, setShowSponsorModal] = useState(false)
  
  // Subscribe to shared rotation state
  useEffect(() => {
    const subscriber = {
      setIndex: (index) => setCurrentIndex(index),
      setRotating: (rotating) => setIsRotating(rotating)
    }
    rotationSubscribers.add(subscriber)
    setCurrentIndex(sharedCurrentIndex) // Set initial value
    
    return () => {
      rotationSubscribers.delete(subscriber)
    }
  }, [position])

  useEffect(() => {
    // Fetch advertisers from API (which uses cached logos from DB)
    // Note: We already have fallback advertisers initialized, so this just updates them
    const fetchAdvertisers = async () => {
      try {
        const response = await axios.get('/api/advertisers')
        console.log('📥 API Response:', response.data)
        console.log('📥 First API ad raw:', response.data?.[0])
        
        if (response.data && response.data.length > 0) {
          // Merge API data with fallback to ensure we have all fields
          const merged = response.data.map(apiAd => {
            const fallback = FALLBACK_ADVERTISERS.find(fa => 
              fa.name === apiAd.name || fa.domain === apiAd.domain
            )
            
            // Force use fallback if API data is missing
            const jobCount = (apiAd.job_count !== undefined && apiAd.job_count !== null && apiAd.job_count > 0)
              ? apiAd.job_count 
              : (fallback?.job_count || fallback?.jobCount || 0)
            
            const isHiring = (apiAd.is_actively_hiring !== undefined && apiAd.is_actively_hiring !== null)
              ? (apiAd.is_actively_hiring === true || apiAd.is_actively_hiring === 'true' || apiAd.is_actively_hiring === 1)
              : (fallback?.is_actively_hiring || fallback?.isActivelyHiring || false)
            
            const mergedAd = {
              ...fallback, // Start with fallback data
              ...apiAd,    // Override with API data
              // Force critical fields from fallback if API has 0/null
              job_count: jobCount,
              jobCount: jobCount,
              is_actively_hiring: isHiring,
              isActivelyHiring: isHiring,
              logo_url: apiAd.logo_url || fallback?.logoUrl || `https://logo.clearbit.com/${apiAd.domain || fallback?.domain}`
            }
            
            if (mergedAd.name === response.data[0]?.name) {
              console.log('🔍 Merging first ad:', {
                api: { job_count: apiAd.job_count, is_actively_hiring: apiAd.is_actively_hiring },
                fallback: { job_count: fallback?.job_count, is_actively_hiring: fallback?.is_actively_hiring },
                final: { job_count: mergedAd.job_count, is_actively_hiring: mergedAd.is_actively_hiring }
              })
            }
            
            return mergedAd
          })
          
          console.log('📊 Merged advertisers (first 3):', merged.slice(0, 3).map(m => ({
            name: m.name,
            job_count: m.job_count,
            jobCount: m.jobCount,
            is_actively_hiring: m.is_actively_hiring,
            isActivelyHiring: m.isActivelyHiring,
            hasFallback: !!FALLBACK_ADVERTISERS.find(fa => fa.name === m.name || fa.domain === m.domain)
          })))
          
          // Remove duplicates by domain to ensure uniqueness
          const uniqueMerged = []
          const seenDomains = new Set()
          for (const ad of merged) {
            const domain = ad.domain || ad.name?.toLowerCase()?.replace(/\s+/g, '') + '.com'
            if (domain && !seenDomains.has(domain)) {
              seenDomains.add(domain)
              uniqueMerged.push(ad)
            }
          }
          
          // Don't shuffle - keep consistent order to prevent random re-renders
          // The rotation index will handle cycling through them
          setAdvertisers(uniqueMerged)
        } else {
          console.log('⚠️ No advertisers from API, using fallback')
          // Remove duplicates from fallback too
          const uniqueFallback = []
          const seenDomains = new Set()
          for (const ad of FALLBACK_ADVERTISERS) {
            const domain = ad.domain || ad.name?.toLowerCase()?.replace(/\s+/g, '') + '.com'
            if (domain && !seenDomains.has(domain)) {
              seenDomains.add(domain)
              uniqueFallback.push(ad)
            }
          }
          // Don't shuffle - keep consistent order to prevent random re-renders
          setAdvertisers(uniqueFallback)
        }
      } catch (error) {
        console.error('❌ Error fetching advertisers:', error)
        // Remove duplicates from fallback too
        const uniqueFallback = []
        const seenDomains = new Set()
        for (const ad of FALLBACK_ADVERTISERS) {
          const domain = ad.domain || ad.name?.toLowerCase()?.replace(/\s+/g, '') + '.com'
          if (domain && !seenDomains.has(domain)) {
            seenDomains.add(domain)
            uniqueFallback.push(ad)
          }
        }
        const shuffled = [...uniqueFallback].sort(() => Math.random() - 0.5)
        setAdvertisers(shuffled)
      }
    }
    
    fetchAdvertisers()
  }, []) // Only fetch once on mount

  // Separate effect for rotation - only create interval ONCE
  // Only the first component (left sidebar) manages the shared rotation interval
  // IMPORTANT: This effect should only run once when the component mounts, not when advertisers change
  useEffect(() => {
    if (position !== 'left') return // Only left sidebar manages rotation
    
    // Only create interval if it doesn't already exist
    if (sharedRotationInterval) {
      return // Interval already exists, don't create another one
    }

    // Initialize sharedUsedDomains on first rotation setup
    sharedUsedDomains.clear()

    // Rotate ads every X seconds - cycle through all ads
    sharedRotationInterval = setInterval(() => {
      // Notify all subscribers to set rotating state
      rotationSubscribers.forEach(sub => {
        if (sub.setRotating) sub.setRotating(true)
      })
      
      setTimeout(() => {
        // Clear used domains when rotating to new set (BEFORE updating index)
        // This ensures both sidebars start fresh for the new rotation
        sharedUsedDomains.clear()
        
        // Move to next set of ads
        // Each sidebar shows 5 cards, so we advance by 10 (5 for each sidebar)
        // to ensure both sidebars get new unique cards with no overlap
        // After showing 20 cards (2 rotations of 10), wrap back to start
        const isMobile = window.innerWidth <= 1200
        const cardsToShow = isMobile ? MOBILE_CARDS_TO_SHOW : CARDS_TO_SHOW
        const advanceBy = cardsToShow * 2 // Advance by 10 (5 for each sidebar)
        sharedCurrentIndex = sharedCurrentIndex + advanceBy
        // Wrap around after showing 20 cards total (2 rotations of 10 cards each)
        const totalCardsToShow = cardsToShow * 4 // 5 * 4 = 20 cards total
        if (sharedCurrentIndex >= totalCardsToShow) {
          sharedCurrentIndex = 0
        }
        
        // Notify all subscribers of the new index
        rotationSubscribers.forEach(sub => {
          if (typeof sub === 'function') {
            sub(sharedCurrentIndex)
          } else if (sub.setIndex) {
            sub.setIndex(sharedCurrentIndex)
          }
        })
        
        // Notify all subscribers to clear rotating state
        rotationSubscribers.forEach(sub => {
          if (sub.setRotating) sub.setRotating(false)
        })
      }, 400) // Half of animation duration
    }, ROTATION_INTERVAL)

    return () => {
      // Cleanup: clear interval when left sidebar unmounts
      if (sharedRotationInterval && position === 'left') {
        clearInterval(sharedRotationInterval)
        sharedRotationInterval = null
      }
    }
  }, [position]) // ONLY depend on position, NOT on advertisers array

  // Memoize the ads calculation - only recalculate when currentIndex or advertisers actually change
  // This prevents random changes on every render
  const displayAds = useMemo(() => {
    // Always use advertisers if available (already merged), otherwise fallback
    const sourceAds = advertisers.length > 0 ? advertisers : FALLBACK_ADVERTISERS
    
    // Remove duplicates from sourceAds to ensure uniqueness
    const uniqueAds = []
    const seenDomains = new Set()
    for (const ad of sourceAds) {
      const rawDomain = ad.domain || ad.name?.toLowerCase()?.replace(/\s+/g, '') + '.com'
      const domain = rawDomain.toLowerCase().replace(/^www\./, '').trim()
      if (domain && !seenDomains.has(domain)) {
        seenDomains.add(domain)
        uniqueAds.push(ad)
      }
    }
    
    // Check if mobile
    const isMobile = window.innerWidth <= 1200
    const cardsToShow = isMobile ? MOBILE_CARDS_TO_SHOW : CARDS_TO_SHOW
    
    // Calculate starting index based on position
    // Left sidebar: starts at currentIndex (0, 10, 20, ...)
    // Right sidebar: starts at currentIndex + 5 (5, 15, 25, ...) to avoid overlap
    const startIndex = position === 'right' ? currentIndex + cardsToShow : currentIndex
    
    const ads = []
    const localUsedDomains = new Set() // Track domains used in THIS sidebar (must be unique within sidebar)
    
    // Create a snapshot of sharedUsedDomains at this moment to avoid modifying it during calculation
    // We'll only add to it if we successfully add an ad
    const snapshotSharedDomains = new Set(sharedUsedDomains)
    
    // Always get exactly cardsToShow ads - loop until we have enough
    // Priority: 1) No duplicates within sidebar, 2) Avoid cross-sidebar duplicates when possible
    let offset = 0
    const maxIterations = uniqueAds.length * 20 // High limit to ensure we can always get enough
    
    while (ads.length < cardsToShow && offset < maxIterations) {
      const index = (startIndex + offset) % uniqueAds.length
      const ad = uniqueAds[index]
      
      if (ad) {
        // Normalize domain for comparison
        const rawDomain = ad.domain || ad.name?.toLowerCase()?.replace(/\s+/g, '') + '.com'
        const domain = rawDomain.toLowerCase().replace(/^www\./, '').trim()
        
        // CRITICAL: Never allow duplicates within the same sidebar
        // But allow cross-sidebar duplicates if necessary to fill all slots
        const isDuplicateInSidebar = localUsedDomains.has(domain)
        
        if (!isDuplicateInSidebar) {
          localUsedDomains.add(domain)
          
          // Try to avoid cross-sidebar duplicates, but don't let it prevent us from filling slots
          // Use snapshot to check - we won't modify sharedUsedDomains here, only read from it
          // sharedUsedDomains is only modified during rotation, not during calculation
          if (!snapshotSharedDomains.has(domain)) {
            snapshotSharedDomains.add(domain)
          }
          
          // Find matching fallback to ensure we have all fields
          const fallback = FALLBACK_ADVERTISERS.find(fa => 
            fa.name === ad.name || fa.domain === ad.domain
          )
          
          // Use fallback values if current values are 0 or false
          const jobCount = (ad.job_count > 0 || ad.jobCount > 0) 
            ? (ad.job_count || ad.jobCount) 
            : (fallback?.job_count || fallback?.jobCount || 0)
          
          const isHiring = (ad.is_actively_hiring === true || ad.is_actively_hiring === 'true' || ad.is_actively_hiring === 1 || ad.isActivelyHiring === true) 
            ? true 
            : (fallback?.is_actively_hiring || fallback?.isActivelyHiring || false)
          
          const logoUrl = ad.logo_url || fallback?.logoUrl || `https://logo.clearbit.com/${ad.domain || fallback?.domain}`
          
          ads.push({
            ...fallback,
            ...ad,
            job_count: jobCount,
            jobCount: jobCount,
            is_actively_hiring: isHiring,
            isActivelyHiring: isHiring,
            logo_url: logoUrl
          })
        }
      }
      
      offset++
    }
    
    // Safety fallback: if we still don't have enough, fill with any available ads (even if duplicates)
    // This should rarely happen, but ensures we always show exactly cardsToShow ads
    if (ads.length < cardsToShow && uniqueAds.length > 0) {
      for (let i = 0; ads.length < cardsToShow && i < uniqueAds.length * 2; i++) {
        const fallbackIndex = (startIndex + offset + i) % uniqueAds.length
        const fallbackAd = uniqueAds[fallbackIndex]
        if (fallbackAd && !localUsedDomains.has((fallbackAd.domain || fallbackAd.name?.toLowerCase()?.replace(/\s+/g, '') + '.com').toLowerCase().replace(/^www\./, '').trim())) {
          const fallback = FALLBACK_ADVERTISERS.find(fa => 
            fa.name === fallbackAd.name || fa.domain === fallbackAd.domain
          )
          const domain = (fallbackAd.domain || fallbackAd.name?.toLowerCase()?.replace(/\s+/g, '') + '.com').toLowerCase().replace(/^www\./, '').trim()
          localUsedDomains.add(domain)
          
          ads.push({
            ...fallback,
            ...fallbackAd,
            job_count: fallbackAd.job_count || fallback?.job_count || 0,
            jobCount: fallbackAd.jobCount || fallback?.jobCount || 0,
            is_actively_hiring: fallbackAd.is_actively_hiring || fallback?.is_actively_hiring || false,
            isActivelyHiring: fallbackAd.isActivelyHiring || fallback?.isActivelyHiring || false,
            logo_url: fallbackAd.logo_url || fallback?.logoUrl || `https://logo.clearbit.com/${fallbackAd.domain || fallback?.domain}`
          })
        }
      }
    }
    
    // Update sharedUsedDomains with domains from the ads we're about to display
    // This happens synchronously during calculation, but only when currentIndex changes
    // (because useMemo only runs when dependencies change)
    ads.forEach(ad => {
      const rawDomain = ad.domain || ad.name?.toLowerCase()?.replace(/\s+/g, '') + '.com'
      const domain = rawDomain.toLowerCase().replace(/^www\./, '').trim()
      if (!sharedUsedDomains.has(domain)) {
        sharedUsedDomains.add(domain)
      }
    })
    
    return ads
  }, [currentIndex, advertisers.length, position]) // Only recalculate when currentIndex changes or advertisers array length changes

  // Check if mobile (position top/bottom means mobile)
  const isMobile = position === 'top' || position === 'bottom'
  
  // For mobile, only show first 5 ads
  const adsToShow = isMobile ? displayAds.slice(0, 5) : displayAds

  return (
    <>
      <div className={`rotating-ads rotating-ads-${position} ${isMobile ? 'mobile' : ''}`}>
        {!isMobile && (
          <div className="rotating-ads-header">
            <h3 className="rotating-ads-title">Sponsored</h3>
          </div>
        )}
        <div className={`rotating-ads-list ${isRotating ? 'rotating' : ''} ${isMobile ? 'mobile-horizontal' : ''}`}>
          {adsToShow.map((ad, idx) => {
            if (!ad) return null
            
            // Extract data - data should already be merged in useEffect
            const jobCount = Number(ad.job_count || ad.jobCount || 0)
            const hiringVal = ad.is_actively_hiring !== undefined ? ad.is_actively_hiring : (ad.isActivelyHiring !== undefined ? ad.isActivelyHiring : false)
            const isActivelyHiring = hiringVal === true || hiringVal === 'true' || hiringVal === 1 || hiringVal === '1'
            const domain = ad.domain || ad.name.toLowerCase().replace(/\s+/g, '') + '.com'
            const logoUrl = ad.logo_url || ad.logoUrl || `https://logo.clearbit.com/${domain}`
            const careersUrl = ad.website_url || ad.websiteUrl || ad.url || '#'
            
            // Force log first ad to debug
            if (idx === 0) {
              console.log('🎯 RENDERING FIRST AD:', {
                name: ad.name,
                jobCount,
                isActivelyHiring,
                logoUrl,
                domain,
                allAdData: ad
              })
            }
            
            return (
              <a
                key={`${ad.id || ad.name}-${currentIndex}-${idx}`}
                href={careersUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`rotating-ad-card ${isMobile ? 'mobile-card' : ''}`}
                style={{ 
                  position: 'relative',
                  zIndex: isRotating ? 0 : 1 
                }}
              >
                {isMobile ? (
                  // Mobile: Only logo and name
                  <div className="rotating-ad-mobile-content">
                    <div className="rotating-ad-mobile-logo">
                      <LogoWithFallbacks 
                        domain={domain}
                        name={ad.name}
                        logoUrl={logoUrl}
                      />
                    </div>
                    <div className="rotating-ad-mobile-name">{ad.name || 'Company'}</div>
                  </div>
                ) : (
                  // Desktop: Full card
                  <div className="rotating-ad-content">
                    <div className="rotating-ad-top">
                      <div className="rotating-ad-logo-wrapper">
                        <LogoWithFallbacks 
                          domain={domain}
                          name={ad.name}
                          logoUrl={logoUrl}
                        />
                      </div>
                      <div className="rotating-ad-info">
                        <div className="rotating-ad-header">
                          <div className="rotating-ad-name">{ad.name || 'Company'}</div>
                          {isActivelyHiring ? (
                            <span className="hiring-badge" style={{ display: 'inline-block', visibility: 'visible' }}>Hiring</span>
                          ) : null}
                        </div>
                        <div className="rotating-ad-jobs-info" style={{ display: 'flex', visibility: 'visible' }}>
                          <div className="job-count-display" style={{ display: 'flex', visibility: 'visible' }}>
                            <span className="job-count-label" style={{ display: 'inline-block', visibility: 'visible' }}>View openings</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rotating-ad-description">{ad.description}</div>
                  </div>
                )}
              </a>
            )
          })}
        </div>
        {!isMobile && (
          <div className="rotating-ads-footer">
            <button 
              className="sponsor-link"
              onClick={() => setShowSponsorModal(true)}
            >
              Advertise
            </button>
          </div>
        )}
      </div>
      {showSponsorModal && (
        <SponsorModal onClose={() => setShowSponsorModal(false)} />
      )}
    </>
  )
}

// Keep old ADVERTISERS array as FALLBACK_ADVERTISERS for backwards compatibility
const ADVERTISERS = FALLBACK_ADVERTISERS

export default RotatingAds

