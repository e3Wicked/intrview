import { useState, useRef } from 'react'
import axios from 'axios'
import './VoicePractice.css'

function VoicePractice({ questions, jobDescription, jobDescriptionHash, sessionId, onXpGained }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioUrl, setAudioUrl] = useState(null)
  const [evaluation, setEvaluation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState(null)
  const [scores, setScores] = useState([])
  const [lastXp, setLastXp] = useState(null)

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)

  if (!questions || questions.length === 0) {
    return <div className="voice-empty">No questions available for voice practice</div>
  }

  const currentQuestion = questions[currentIndex]
  const averageScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setAudioUrl(URL.createObjectURL(audioBlob))
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000)
    } catch (error) {
      console.error('Error accessing microphone:', error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }

  const handleSubmit = async () => {
    if (!audioChunksRef.current.length) return

    setTranscribing(true)
    setLoading(true)
    setEvaluation(null)
    setTranscript(null)
    setLastXp(null)

    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1]
        try {
          const response = await axios.post('/api/voice/evaluate', {
            audioBase64: base64Audio,
            question: currentQuestion.question,
            jobDescription,
            jobDescriptionHash: jobDescriptionHash || '',
            sessionId: sessionId || null,
            questionCategory: currentQuestion.category || null,
          })

          if (response.data.success) {
            if (response.data.transcription) setTranscript(response.data.transcription)
            else if (response.data.evaluation?.transcription) setTranscript(response.data.evaluation.transcription)
            setTranscribing(false)

            if (response.data.evaluation) {
              const newScore = response.data.evaluation.score
              setScores(prev => [...prev, newScore])
              setEvaluation(response.data.evaluation)
            }

            if (response.data.xpEarned !== undefined) {
              setLastXp(response.data.xpEarned)
              if (onXpGained) {
                onXpGained({
                  xpEarned: response.data.xpEarned,
                  totalXp: response.data.totalXp,
                  levelUp: response.data.levelUp,
                  levelTitle: response.data.levelTitle,
                  newAchievements: response.data.newAchievements,
                })
              }
            }
          }
        } catch (error) {
          console.error('Error evaluating voice:', error)
        } finally {
          setLoading(false)
          setTranscribing(false)
        }
      }
      reader.readAsDataURL(audioBlob)
    } catch (error) {
      console.error('Error processing audio:', error)
      setLoading(false)
      setTranscribing(false)
    }
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setAudioUrl(null)
      setEvaluation(null)
      setTranscript(null)
      setLastXp(null)
      audioChunksRef.current = []
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setAudioUrl(null)
      setEvaluation(null)
      setTranscript(null)
      setLastXp(null)
      audioChunksRef.current = []
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="voice-container">
      <div className="voice-header">
        {averageScore !== null && (
          <div className="voice-average">
            Voice Average: <span className="score-value">{averageScore}/100</span>
          </div>
        )}
      </div>

      <div className="voice-question-card">
        <div className="voice-question-header">
          <span className="voice-number">Question {currentIndex + 1} of {questions.length}</span>
          {currentQuestion.category && (
            <span className="voice-category">{currentQuestion.category}</span>
          )}
        </div>
        <h3 className="voice-question-text">{currentQuestion.question}</h3>
      </div>

      <div className="voice-recording-section">
        {!isRecording && !audioUrl && (
          <button className="voice-record-btn" onClick={startRecording}>Start Recording</button>
        )}
        {isRecording && (
          <div className="voice-recording-active">
            <div className="recording-indicator">
              <span className="recording-dot"></span>
              Recording: {formatTime(recordingTime)}
            </div>
            <button className="voice-stop-btn" onClick={stopRecording}>Stop Recording</button>
          </div>
        )}
        {audioUrl && !isRecording && (
          <div className="voice-audio-player">
            <audio controls src={audioUrl} className="audio-element" />
            <div className="voice-audio-actions">
              <button className="voice-retry-btn" onClick={() => {
                setAudioUrl(null)
                setTranscript(null)
                setEvaluation(null)
                setLastXp(null)
                audioChunksRef.current = []
              }}>Record Again</button>
              <button className="voice-submit-btn" onClick={handleSubmit} disabled={loading}>
                {transcribing ? 'Transcribing...' : loading ? 'Evaluating...' : 'Submit for Evaluation'}
              </button>
            </div>
          </div>
        )}
      </div>

      {transcript && (
        <div className="transcript-preview">
          <h4 className="transcript-title">Your Answer (Transcribed)</h4>
          <p className="transcript-text">{transcript}</p>
        </div>
      )}

      {evaluation && (
        <div className="voice-evaluation">
          <div className="evaluation-header">
            <h3>Evaluation</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className={`score-badge score-${evaluation.score >= 80 ? 'high' : evaluation.score >= 60 ? 'medium' : 'low'}`}>
                {evaluation.score}/100
              </div>
              {lastXp !== null && lastXp > 0 && (
                <div className="quiz-xp-gain">+{lastXp} XP</div>
              )}
            </div>
          </div>

          {evaluation.contentStrengths && (
            <div className="evaluation-section">
              <h4 className="evaluation-title">Content Strengths</h4>
              <ul className="evaluation-list strengths">
                {evaluation.contentStrengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {evaluation.contentImprovements && (
            <div className="evaluation-section">
              <h4 className="evaluation-title">Content Improvements</h4>
              <ul className="evaluation-list improvements">
                {evaluation.contentImprovements.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {evaluation.deliveryFeedback && (
            <div className="evaluation-section">
              <h4 className="evaluation-title">Delivery Feedback</h4>
              <p className="delivery-text">{evaluation.deliveryFeedback}</p>
            </div>
          )}
          {evaluation.tips && (
            <div className="evaluation-section">
              <h4 className="evaluation-title">Tips</h4>
              <ul className="evaluation-list tips">
                {evaluation.tips.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {evaluation.feedback && (
            <div className="evaluation-feedback"><p>{evaluation.feedback}</p></div>
          )}
        </div>
      )}

      <div className="voice-controls">
        <button className="voice-nav-btn" onClick={handlePrev} disabled={currentIndex === 0}>Previous</button>
        <button className="voice-nav-btn" onClick={handleNext} disabled={currentIndex === questions.length - 1}>Next</button>
      </div>
    </div>
  )
}

export default VoicePractice
