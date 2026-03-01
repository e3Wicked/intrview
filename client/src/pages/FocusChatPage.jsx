import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import FocusChat from '../components/FocusChat'

function FocusChatPage({ user }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const skill = searchParams.get('skill') || ''

  useEffect(() => {
    if (!skill) navigate('/dashboard')
  }, [skill, navigate])

  if (!skill) return null

  return <FocusChat skill={skill} user={user} />
}

export default FocusChatPage
