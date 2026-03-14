import { useState, useRef, useEffect, useCallback } from 'react'
import { MicVAD } from '@ricky0123/vad-web'
import { api } from '../utils/api'
import './MockInterviewSession.css'

const SESSION_STATES = {
  SPEAKING: 'speaking',
  LISTENING: 'listening',
  RECORDING: 'recording',
  PROCESSING: 'processing',
  ERROR: 'error',
}

function float32ToWavBlob(float32Array, sampleRate) {
  const numChannels = 1
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataSize = float32Array.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function MockInterviewSession({ sessionId, questionCount, openingAudioBase64, openingText, firstQuestionText, interviewerPersona, onEnd }) {
  const [status, setStatus] = useState(SESSION_STATES.SPEAKING)
  const [transcript, setTranscript] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState(1)
  const [error, setError] = useState(null)
  const [isHolding, setIsHolding] = useState(false)
  const [turnScores, setTurnScores] = useState([])
  const [sessionStartTime] = useState(() => Date.now())
  const [elapsedTime, setElapsedTime] = useState('0:00')
  const [inputMode, setInputMode] = useState(() => {
    if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return 'ptt'
    return 'vad'
  })

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const audioRef = useRef(null)
  const audioContextInitialized = useRef(false)
  const silenceDetectorRef = useRef(null) // { analyser, interval, silentSince }

  // Refs so VAD callbacks always read the latest values (avoids stale closures)
  const inputModeRef = useRef(inputMode)
  const statusRef = useRef(status)
  const currentQuestionRef = useRef(currentQuestion)
  useEffect(() => { inputModeRef.current = inputMode }, [inputMode])
  useEffect(() => { statusRef.current = status }, [status])
  useEffect(() => { currentQuestionRef.current = currentQuestion }, [currentQuestion])

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - sessionStartTime) / 1000)
      const mins = Math.floor(diff / 60)
      const secs = String(diff % 60).padStart(2, '0')
      setElapsedTime(`${mins}:${secs}`)
    }, 1000)
    return () => clearInterval(interval)
  }, [sessionStartTime])

  const initAudioContext = useCallback(() => {
    if (!audioContextInitialized.current) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      ctx.resume().then(() => ctx.close())
      audioContextInitialized.current = true
    }
  }, [])

  const playAudio = useCallback((base64String) => {
    setStatus(SESSION_STATES.SPEAKING)
    initAudioContext()

    // Stop any previous audio to prevent AbortError
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current = null
    }

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
      // AbortError is expected when audio is interrupted (e.g. React strict mode)
      if (err.name !== 'AbortError') {
        console.error('Audio play error:', err)
      }
      // Only transition if this audio is still the current one
      if (audioRef.current === audio) {
        setStatus(SESSION_STATES.LISTENING)
      }
    })
  }, [initAudioContext])

  // Shared function: send base64 audio to the server and handle the response
  const sendAudioResponse = useCallback(async (base64) => {
    try {
      const res = await api.mockInterview.respond({
        sessionId,
        audioBase64: base64,
      })

      const data = res.data

      if (data.transcript) {
        setTranscript(prev => [...prev, { role: 'user', text: data.transcript }])
      }

      if (data.responseText) {
        setTranscript(prev => [...prev, { role: 'interviewer', text: data.responseText }])
      }

      if (data.turnEvaluation) {
        setTurnScores(prev => [...prev, {
          questionNumber: currentQuestionRef.current,
          score: data.turnEvaluation.score,
          brief: data.turnEvaluation.brief,
          isFollowUp: !!data.isFollowUp,
        }])
      }

      if (data.questionProgress) {
        const [current] = data.questionProgress.split('/')
        setCurrentQuestion(parseInt(current, 10))
      }

      if (data.isLastQuestion) {
        setTimeout(() => onEnd(sessionId), 3000)
      }

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

  // Imperative VAD — avoids React strict mode destroying the mic stream
  const vadRef = useRef(null)
  const [vadReady, setVadReady] = useState(false)
  const sendAudioResponseRef = useRef(sendAudioResponse)
  sendAudioResponseRef.current = sendAudioResponse

  // VAD for speech-start detection only; silence detection uses Web Audio API analyser
  useEffect(() => {
    let cancelled = false
    let instance = null

    async function initVAD() {
      try {
        console.log('[VAD] creating MicVAD instance...')
        instance = await MicVAD.new({
          baseAssetPath: '/',
          onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/',
          ortConfig: (ort) => { ort.env.wasm.numThreads = 1 },
          positiveSpeechThreshold: 0.5,
          negativeSpeechThreshold: 0.35,
          redemptionFrames: 8,
          onSpeechStart: () => {
            console.log('[VAD] onSpeechStart — mode:', inputModeRef.current, 'status:', statusRef.current)
            if (inputModeRef.current === 'vad' && statusRef.current === SESSION_STATES.LISTENING) {
              // Start a real MediaRecorder for the audio capture
              startVADRecording()
            }
          },
          onSpeechEnd: () => {
            // We ignore this — silence detection is handled by the analyser below
            console.log('[VAD] onSpeechEnd (ignored, using analyser)')
          },
        })
        if (!cancelled) {
          vadRef.current = instance
          setVadReady(true)
          console.log('[VAD] MicVAD ready')
        } else {
          instance.destroy()
        }
      } catch (err) {
        console.error('[VAD] Failed to create MicVAD:', err)
      }
    }

    initVAD()

    return () => {
      cancelled = true
      if (instance) {
        instance.pause()
        instance.destroy()
        console.log('[VAD] destroyed on cleanup')
      }
    }
  }, []) // Only init once

  // Start MediaRecorder + silence analyser when VAD detects speech
  const startVADRecording = useCallback(() => {
    statusRef.current = SESSION_STATES.RECORDING
    setStatus(SESSION_STATES.RECORDING)

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      // Set up MediaRecorder to capture actual audio
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      const chunks = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        stopSilenceDetector()
        if (statusRef.current !== SESSION_STATES.RECORDING) {
          // Already moved on (e.g. user ended interview)
          return
        }
        statusRef.current = SESSION_STATES.PROCESSING
        setStatus(SESSION_STATES.PROCESSING)
        try {
          const webmBlob = new Blob(chunks, { type: 'audio/webm' })
          console.log('[VAD] recorded audio size:', (webmBlob.size / 1024).toFixed(0), 'KB')
          const base64 = await blobToBase64(webmBlob)
          await sendAudioResponseRef.current(base64)
        } catch (err) {
          console.error('VAD audio processing error:', err)
          setError('Failed to process your response. Please try again.')
          setStatus(SESSION_STATES.ERROR)
        }
      }
      recorder.start(250) // collect in 250ms chunks
      mediaRecorderRef.current = recorder

      // Set up silence detection via Web Audio API analyser
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      let silentSince = null
      const SILENCE_THRESHOLD = 15 // RMS level below which we consider silence
      const SILENCE_DURATION = 2000 // 2 seconds of silence to stop

      const interval = setInterval(() => {
        analyser.getByteTimeDomainData(dataArray)
        // Calculate RMS volume
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / dataArray.length) * 100

        if (rms < SILENCE_THRESHOLD) {
          if (!silentSince) silentSince = Date.now()
          const silentFor = Date.now() - silentSince
          if (silentFor >= SILENCE_DURATION) {
            console.log('[Silence] detected', SILENCE_DURATION, 'ms of silence — stopping recording')
            clearInterval(interval)
            if (recorder.state === 'recording') recorder.stop()
            audioCtx.close()
          }
        } else {
          silentSince = null
        }
      }, 100)

      silenceDetectorRef.current = { interval, audioCtx }
    }).catch((err) => {
      console.error('[VAD] mic access error:', err)
      setError('Microphone access failed. Please check permissions.')
      setStatus(SESSION_STATES.ERROR)
    })
  }, [])

  const stopSilenceDetector = useCallback(() => {
    if (silenceDetectorRef.current) {
      clearInterval(silenceDetectorRef.current.interval)
      silenceDetectorRef.current.audioCtx.close().catch(() => {})
      silenceDetectorRef.current = null
    }
  }, [])

  // Control VAD start/pause based on status and input mode
  useEffect(() => {
    if (!vadReady || !vadRef.current || inputMode !== 'vad') {
      if (vadRef.current) vadRef.current.pause()
      return
    }
    if (status === SESSION_STATES.LISTENING) {
      console.log('[VAD control] starting VAD')
      vadRef.current.start()
    } else {
      vadRef.current.pause()
    }
  }, [status, inputMode, vadReady])

  // Add opening text and first question to transcript on mount
  useEffect(() => {
    const initial = []
    if (openingText) {
      initial.push({ role: 'interviewer', text: openingText })
    }
    setTranscript(initial)

    if (openingAudioBase64) {
      playAudio(openingAudioBase64)
    } else {
      setStatus(SESSION_STATES.LISTENING)
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const startRecording = useCallback(async () => {
    initAudioContext()
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

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
      await sendAudioResponse(base64)
    } catch (err) {
      console.error('Failed to send response:', err)
      setError('Failed to process your response. Please try again.')
      setStatus(SESSION_STATES.ERROR)
    }
  }, [sendAudioResponse])

  const handleEndInterview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    stopSilenceDetector()
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    onEnd(sessionId)
  }, [sessionId, onEnd, stopSilenceDetector])

  // Spacebar hold-to-talk (PTT mode only)
  useEffect(() => {
    if (inputMode !== 'ptt') return

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
  }, [status, startRecording, stopRecordingAndSend, inputMode])

  const retryFromError = () => {
    setError(null)
    setStatus(SESSION_STATES.LISTENING)
  }

  const scoreColor = (score) => {
    if (score >= 80) return '#22c55e'
    if (score >= 50) return '#f59e0b'
    return '#ef4444'
  }

  const mainScores = turnScores.filter(t => !t.isFollowUp)
  const avgScore = mainScores.length > 0
    ? Math.round(mainScores.reduce((sum, t) => sum + t.score, 0) / mainScores.length)
    : 0

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

      {/* Live Scoring Strip */}
      <div className="mock-session-scoring-strip">
        <div className="mock-session-scoring-stats">
          <span className="mock-session-stat">
            <span className="mock-session-stat-label">Time</span>
            <span className="mock-session-stat-value">{elapsedTime}</span>
          </span>
          {mainScores.length > 0 && (
            <>
              <span className="mock-session-stat-divider" />
              <span className="mock-session-stat">
                <span className="mock-session-stat-label">Avg</span>
                <span className="mock-session-stat-value" style={{ color: scoreColor(avgScore) }}>{avgScore}</span>
              </span>
            </>
          )}
        </div>
        {mainScores.length > 0 && (
          <div className="mock-session-scoring-dots">
            {mainScores.map((t, i) => (
              <div
                key={i}
                className="mock-session-score-dot"
                style={{ backgroundColor: scoreColor(t.score) }}
                title={`Q${t.questionNumber}: ${t.score}/100 — ${t.brief}`}
              >
                <span className="mock-session-dot-label">Q{t.questionNumber}</span>
                <span className="mock-session-dot-score">{t.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {interviewerPersona && (
        <div className="mock-session-interviewer">
          {interviewerPersona.name}, {interviewerPersona.title}
        </div>
      )}

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
            <span>{inputMode === 'vad' ? (!vadReady ? 'Setting up mic...' : 'Listening...') : 'Your turn - hold to talk'}</span>
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

      {/* VAD listening indicator */}
      {status === SESSION_STATES.LISTENING && inputMode === 'vad' && (
        <div className="mock-session-vad-listening">
          <div className="mock-session-vad-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </div>
          <span>Just start talking...</span>
        </div>
      )}

      {/* Push-to-Talk Button (PTT mode only) */}
      {status === SESSION_STATES.LISTENING && inputMode === 'ptt' && (
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

      {status === SESSION_STATES.RECORDING && inputMode === 'ptt' && (
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
              {entry.role === 'interviewer' ? (interviewerPersona?.name || 'Interviewer') : 'You'}
            </div>
            <div className="mock-session-message-text">{entry.text}</div>
          </div>
        ))}
      </div>

      {/* Bottom Controls */}
      <div className="mock-session-controls">
        <div className="mock-session-mode-toggle">
          <button
            className={`mock-session-mode-btn ${inputMode === 'vad' ? 'active' : ''}`}
            onClick={() => setInputMode('vad')}
            title="Voice Detection (hands-free)"
          >
            Auto
          </button>
          <button
            className={`mock-session-mode-btn ${inputMode === 'ptt' ? 'active' : ''}`}
            onClick={() => setInputMode('ptt')}
            title="Push to Talk"
          >
            Hold
          </button>
        </div>
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
