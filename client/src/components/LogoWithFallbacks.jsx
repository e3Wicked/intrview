import { useState, useEffect } from 'react'
import './LogoWithFallbacks.css'

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
      className="company-logo-img"
      onError={handleError}
      onLoad={() => setShowPlaceholder(false)}
    />
  )
}

export default LogoWithFallbacks

