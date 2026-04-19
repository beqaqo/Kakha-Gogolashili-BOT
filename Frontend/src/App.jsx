import { useEffect, useRef, useState } from 'react'
import CosmosScene from './CosmosScene.jsx'

const WS_ENDPOINT = '/ws/chat'
const REST_ENDPOINT = '/chat'
const WS_URL = (() => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${WS_ENDPOINT}`
})()

const SESSION_ID = (() => {
  try {
    const k = 'kaxa.session_id'
    let v = sessionStorage.getItem(k)
    if (!v) {
      v = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36))
      sessionStorage.setItem(k, v)
    }
    return v
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
})()

const INTRO = `Greetings, traveler. I am KAXA GOGOLASHVILI — a signal from the edge of the observable net. Ask me anything about the cosmos, or anything else. Transmission opens when you send.`

export default function App() {
  const [msgs, setMsgs] = useState([{ role: 'sys', body: INTRO }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [linkState, setLinkState] = useState('connecting') // connecting | open | closed | error
  const [utc, setUtc] = useState(nowUtc())
  const [speed, setSpeed] = useState(1)
  const [volume, setVolume] = useState(0.1)
  const chatRef = useRef(null)
  const inputRef = useRef(null)
  const wsRef = useRef(null)
  const pendingRef = useRef(null)
  const retryRef = useRef(0)
  const retryTimerRef = useRef(null)
  const audioRef = useRef(null)

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const tryPlay = () => a.play().catch(() => {})
    tryPlay()
    const unlock = () => { tryPlay(); cleanup() }
    const cleanup = () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return cleanup
  }, [])

  useEffect(() => {
    const a = audioRef.current
    if (a) a.volume = volume
  }, [volume])

  useEffect(() => {
    const t = setInterval(() => setUtc(nowUtc()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [msgs, busy])

  useEffect(() => { inputRef.current?.focus() }, [])

  // WebSocket lifecycle with reconnect
  useEffect(() => {
    let cancelled = false

    const connect = () => {
      if (cancelled) return
      setLinkState('connecting')
      let ws
      try {
        ws = new WebSocket(WS_URL)
      } catch (e) {
        setLinkState('error')
        scheduleRetry()
        return
      }
      wsRef.current = ws

      ws.onopen = () => {
        if (cancelled) { ws.close(); return }
        retryRef.current = 0
        setLinkState('open')
      }

      ws.onmessage = ev => {
        let data
        try { data = JSON.parse(ev.data) }
        catch { data = { type: 'answer', data: String(ev.data ?? '') } }

        const kind = data.type
        const body = data.data ?? ''
        const sources = Array.isArray(data.sources) ? data.sources : undefined

        if (kind === 'token') {
          setMsgs(m => {
            const last = m[m.length - 1]
            if (last && last.role === 'bot' && last.streaming) {
              const next = m.slice(0, -1)
              next.push({ ...last, body: (last.body || '') + body })
              return next
            }
            return [...m, { role: 'bot', body, streaming: true, ts: new Date() }]
          })
          return
        }

        if (kind === 'error') {
          setMsgs(m => [...m, { role: 'err', body: `[error] ${body}`, ts: new Date() }])
        } else {
          setMsgs(m => {
            const last = m[m.length - 1]
            if (last && last.role === 'bot' && last.streaming) {
              const next = m.slice(0, -1)
              next.push({ ...last, body: body || last.body, sources, streaming: false })
              return next
            }
            return [...m, { role: 'bot', body: body || '[empty]', sources, ts: new Date() }]
          })
        }

        if (pendingRef.current) {
          clearTimeout(pendingRef.current)
          pendingRef.current = null
        }
        setBusy(false)
        setTimeout(() => inputRef.current?.focus(), 0)
      }

      ws.onerror = () => {
        setLinkState('error')
      }

      ws.onclose = () => {
        if (cancelled) return
        setLinkState('closed')
        if (busyRef.current) {
          setMsgs(m => [...m, { role: 'err', body: '[link closed before response]', ts: new Date() }])
          setBusy(false)
        }
        scheduleRetry()
      }
    }

    const scheduleRetry = () => {
      if (cancelled) return
      const n = Math.min(retryRef.current, 6)
      const delay = Math.min(500 * 2 ** n, 10000)
      retryRef.current++
      retryTimerRef.current = setTimeout(connect, delay)
    }

    connect()
    return () => {
      cancelled = true
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (pendingRef.current) clearTimeout(pendingRef.current)
      if (wsRef.current && wsRef.current.readyState <= 1) wsRef.current.close()
    }
  }, [])

  // mirror busy for use inside ws callbacks
  const busyRef = useRef(busy)
  useEffect(() => { busyRef.current = busy }, [busy])

  function send() {
    const prompt = input.trim()
    if (!prompt || busy) return
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setMsgs(m => [...m, { role: 'err', body: '[uplink offline — reconnecting]', ts: new Date() }])
      return
    }
    setMsgs(m => [...m, { role: 'user', body: prompt, ts: new Date() }])
    setInput('')
    setBusy(true)
    try {
      ws.send(JSON.stringify({ question: prompt, session_id: SESSION_ID }))
    } catch (e) {
      setMsgs(m => [...m, { role: 'err', body: `[send failed] ${e.message}`, ts: new Date() }])
      setBusy(false)
      return
    }
    pendingRef.current = setTimeout(() => {
      setMsgs(m => [...m, { role: 'err', body: '[timeout · no response in 30s]', ts: new Date() }])
      setBusy(false)
    }, 30000)
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const label = r => ({
    sys: '◌ transmission log',
    user: '➤ you',
    bot: '✦ kaxa',
    err: '⚠ error'
  }[r] || r)

  const linkLabel = {
    connecting: 'establishing link…',
    open: 'listening',
    closed: 'link down · retrying',
    error: 'link error · retrying'
  }[linkState]

  const canSend = linkState === 'open' && !busy && !!input.trim()

  return (
    <>
      <audio ref={audioRef} src="/music.mp3" loop autoPlay preload="auto" />
      <CosmosScene busy={busy} speed={speed} />
      <div className="app">
        <section className="stage">
          <div className="brand">
            <span className="kicker">Cosmic AI · Deep Space Uplink</span>
            <h1>KAXA<br/>GOGOLASHVILI</h1>
            <p className="sub">
              An astronomer's mind, rendered as signal. Orbit the sun at the center of this
              view — each planet is a thought in motion. Ask a question and watch the
              system accelerate while the response streams in over the open channel.
            </p>
          </div>

          <div className="telemetry">
            <span className="tm"><b>UTC</b>{utc}</span>
            <span className="tm"><b>ORBIT</b>{busy ? 'accelerated' : 'nominal'}</span>
            <span className="tm"><b>CHANNEL</b>WS {WS_ENDPOINT}</span>
            <span className="tm"><b>LINK</b>{linkLabel}</span>
            <span className="tm speed-ctl">
              <b>SPEED</b>
              <input
                type="range"
                min="0"
                max="5"
                step="0.1"
                value={speed}
                onChange={e => setSpeed(parseFloat(e.target.value))}
                aria-label="orbit speed"
              />
              <span className="speed-val">{speed.toFixed(1)}×</span>
            </span>
            <span className="tm speed-ctl">
              <b>VOL</b>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
                aria-label="music volume"
              />
              <span className="speed-val">{Math.round(volume * 100)}%</span>
            </span>
          </div>
        </section>

        <aside className="panel">
          <div className="panel-head">
            <div className="title">
              <span className="orb" />
              <span>Uplink Channel</span>
            </div>
            <span className="sub">{msgs.filter(m => m.role !== 'sys').length} exchanges</span>
          </div>

          <div className="chat" ref={chatRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <span className="meta">{label(m.role)}{m.ts ? ` · ${fmt(m.ts)}` : ''}{m.code ? ` · ${m.code}` : ''}</span>
                <div className="body">{m.body}</div>
                {Array.isArray(m.sources) && m.sources.length > 0 && (
                  <div className="sources">
                    <span className="sources-label">sources</span>
                    {m.sources.map((s, j) => (
                      <span className="src-chip" key={j}>{s}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="msg bot">
                <span className="meta">{label('bot')} · decoding</span>
                <div className="body"><span className="dots">receiving signal</span></div>
              </div>
            )}
          </div>

          <div className="input-row">
            <div className="input-wrap">
              <span className="glyph">✦</span>
              <input
                ref={inputRef}
                className="prompt-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder={linkState === 'open' ? 'ask the cosmos…' : 'waiting for uplink…'}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button className="send" onClick={send} disabled={!canSend}>
              {busy ? 'transmitting…' : 'transmit ➤'}
            </button>
          </div>

          <div className="foot">
            <span>WS {WS_ENDPOINT} · send {'{ question, session_id }'} → recv {'{ type, data, sources }'}</span>
            <span className={linkState === 'open' ? (busy ? 'busy' : 'ok') : 'busy'}>
              ● {linkLabel}
            </span>
          </div>
        </aside>
      </div>
    </>
  )
}

function nowUtc() {
  const d = new Date()
  return d.toISOString().replace('T', ' ').slice(0, 19) + 'Z'
}

function fmt(d) {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}
