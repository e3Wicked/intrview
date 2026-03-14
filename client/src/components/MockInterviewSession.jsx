// TODO: Replace manual push-to-talk with @ricky0123/vad-react for always-on mic
// The current implementation uses a hold-to-talk button as a fallback.
// To swap in VAD: replace the push-to-talk handlers with VAD's onSpeechStart/onSpeechEnd callbacks,
// keep the same MediaRecorder + base64 pipeline, and remove the manual button.

import { useState, useRef, useEffect, useCallback } from 'react'
import { api } from '../utils/api'
import './MockInterviewSession.css'

const SESSION_STATES = {
  SPEAKING: 'speaking',
  LISTENING: 'listening',
  RECORDING: 'recording',
  PROCESSING: 'processing',
  ERROR: 'error',
}

function MockInterviewSession({ sessionId, questionCount, openingAudioBase64, openingText, firstQuestionText, onEnd }) {
  const [status, setStatus] = useState(SESSION_STATES.SPEAKING)
  const [transcript, setTranscript] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState(1)
  const [error, setError] = useState(null)
  const [isHolding, setIsHolding] = useState(false)

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const audioRef = useRef(null)
  const audioContextInitialized = useRef(false)

  // Add opening text and first question to transcript on mount
  useEffect(() => {
    const initial = []
    if (openingText) {
      initial.push({ role: 'interviewer', text: openingText })
    }
    setTranscript(initial)

    // Play opening audio if provided
    if (openingAudioBase64) {
      playAudio(openingAudioBase64)
    } else {
      setStatus(SESSION_STATES.LISTENING)
    }

    return () => {
      // Cleanup on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const initAudioContext = useCallback(() => {
    if (!audioContextInitialized.current) {
      // Create and immediately close an AudioContext to unlock audio on mobile
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      ctx.resume().then(() => ctx.close())
      audioContextInitialized.current = true
    }
  }, [])

  const playAudio = useCallback((base64String) => {
    setStatus(SESSION_STATES.SPEAKING)
    initAudioContext()

    const audio = new Audio('data:audio/mp3;base64,' + base64String)
    audioRef.current = audio

    audio.onended = () => {
      setStatus(SESSION_STATES.LISTENING)
    }

    audio.onerror = () => {
      console.error('Audio playback failed')
      setStatus(SESSION_STATES.LISTENING)
    }

    audio.play().catch((err) => {
      console.error('Audio play error:', err)
      setStatus(SESSION_STATES.LISTENING)
    })
  }, [initAudioContext])

  const startRecording = useCallback(async () => {
    initAudioContext()
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Determine supported mimeType
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.start()
      setStatus(SESSION_STATES.RECORDING)
      setIsHolding(true)
    } catch (err) {
      console.error('Microphone access error:', err)
      setError('Could not access microphone. Please check permissions.')
      setStatus(SESSION_STATES.ERROR)
    }
  }, [initAudioContext])

  const stopRecordingAndSend = useCallback(async () => {
    setIsHolding(false)

    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
      return
    }

    const recorder = mediaRecorderRef.current

    const audioPromise = new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType })
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop())
          streamRef.current = null
        }
        resolve(blob)
      }
    })

    recorder.stop()
    setStatus(SESSION_STATES.PROCESSING)

    try {
      const audioBlob = await audioPromise
      const base64 = await blobToBase64(audioBlob)

      const res = await api.mockInterview.respond({
        sessionId,
        audioBase64: base64,
      })

      const data = res.data

      // Add user transcript to conversation
      if (data.transcript) {
        setTranscript(prev => [...prev, { role: 'user', text: data.transcript }])
      }

      // Add AI response to conversation
      if (data.responseText) {
        setTranscript(prev => [...prev, { role: 'interviewer', text: data.responseText }])
      }

      // Update question counter from "3/10" format
      if (data.questionProgress) {
        const [current] = data.questionProgress.split('/')
        setCurrentQuestion(parseInt(current, 10))
      }

      // Check if interview is complete
      if (data.isLastQuestion) {
        // Small delay so user can see the final response
        setTimeout(() => onEnd(sessionId), 3000)
      }

      // Play AI response audio or transition to listening
      if (data.responseAudioBase64) {
        playAudio(data.responseAudioBase64)
      } else {
        setStatus(SESSION_STATES.LISTENING)
      }
    } catch (err) {
      console.error('Failed to send response:', err)
      setError('Failed to process your response. Please try again.')
      setStatus(SESSION_STATES.ERROR)
    }
  }, [sessionId, playAudio, onEnd])

  const handleEndInterview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    onEnd(sessionId)
  }, [sessionId, onEnd])

  // Spacebar hold-to-talk
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat && status === SESSION_STATES.LISTENING) {
        e.preventDefault()
        startRecording()
      }
    }

    const handleKeyUp = (e) => {
      if (e.code === 'Space' && status === SESSION_STATES.RECORDING) {
        e.preventDefault()
        stopRecordingAndSend()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [status, startRecording, stopRecordingAndSend])

  const retryFromError = () => {
    setError(null)
    setStatus(SESSION_STATES.LISTENING)
  }

  return (
    <div className="mock-session">
      {/* Progress */}
      <div className="mock-session-progress">
        <span className="mock-session-progress-text">
          Question {currentQuestion} of {questionCount}
        </span>
        <div className="mock-session-progress-bar">
          <div
            className="mock-session-progress-fill"
            style={{ width: `${(currentQuestion / questionCount) * 100}%` }}
          />
        </div>
      </div>

      {/* Status Indicator */}
      <div className="mock-session-status">
        {status === SESSION_STATES.SPEAKING && (
          <div className="mock-session-indicator speaking">
            <div className="mock-session-pulse" />
            <span>Interviewer is speaking...</span>
          </div>
        )}
        {status === SESSION_STATES.LISTENING && (
          <div className="mock-session-indicator listening">
            <div className="mock-session-pulse listening" />
            <span>Your turn - hold to talk</span>
          </div>
        )}
        {status === SESSION_STATES.RECORDING && (
          <div className="mock-session-indicator recording">
            <div className="mock-session-waveform">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="mock-session-wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
            <span>Recording...</span>
          </div>
        )}
        {status === SESSION_STATES.PROCESSING && (
          <div className="mock-session-indicator processing">
            <div className="mock-session-spinner" />
            <span>Processing your response...</span>
          </div>
        )}
        {status === SESSION_STATES.ERROR && (
          <div className="mock-session-indicator error">
            <span>{error || 'Something went wrong'}</span>
            <button className="mock-session-retry" onClick={retryFromError}>Try Again</button>
          </div>
        )}
      </div>

      {/* Push-to-Talk Button */}
      {status === SESSION_STATES.LISTENING && (
        <button
          className="mock-session-talk-btn"
          onMouseDown={startRecording}
          onMouseUp={stopRecordingAndSend}
          onMouseLeave={() => { if (isHolding) stopRecordingAndSend() }}
          onTouchStart={(e) => { e.preventDefault(); startRecording() }}
          onTouchEnd={(e) => { e.preventDefault(); stopRecordingAndSend() }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
          Hold to Talk
          <span className="mock-session-talk-hint">or hold Spacebar</span>
        </button>
      )}

      {status === SESSION_STATES.RECORDING && (
        <button className="mock-session-talk-btn active">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
          Release to Send
        </button>
      )}

      {/* Transcript */}
      <div className="mock-session-transcript">
        {transcript.map((entry, i) => (
          <div key={i} className={`mock-session-message ${entry.role}`}>
            <div className="mock-session-message-label">
              {entry.role === 'interviewer' ? 'Interviewer' : 'You'}
            </div>
            <div className="mock-session-message-text">{entry.text}</div>
          </div>
        ))}
      </div>

      {/* Bottom Controls */}
      <div className="mock-session-controls">
        <button className="mock-session-end-btn" onClick={handleEndInterview}>
          End Interview
        </button>
      </div>
    </div>
  )
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default MockInterviewSession
