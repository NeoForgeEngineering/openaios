export interface SttProvider {
  /** Transcribe audio to text. */
  transcribe(
    audio: Buffer,
    opts?: { language?: string; format?: string },
  ): Promise<string>
  /** Provider name */
  readonly name: string
}

export type SttProviderName = 'deepgram' | 'whisper'

export function createSttProvider(
  provider: SttProviderName,
  opts?: { apiKey?: string; baseUrl?: string; model?: string },
): SttProvider {
  switch (provider) {
    case 'deepgram':
      return new DeepgramStt(opts)
    case 'whisper':
      return new WhisperStt(opts)
  }
}

// ---------------------------------------------------------------------------
// Deepgram
// ---------------------------------------------------------------------------

class DeepgramStt implements SttProvider {
  readonly name = 'deepgram'
  private apiKey?: string
  private baseUrl: string
  private model: string

  constructor(opts?: { apiKey?: string; baseUrl?: string; model?: string }) {
    const apiKey = opts?.apiKey ?? process.env.DEEPGRAM_API_KEY
    if (apiKey !== undefined) this.apiKey = apiKey
    this.baseUrl = opts?.baseUrl ?? 'https://api.deepgram.com/v1'
    this.model = opts?.model ?? 'nova-2'
  }

  async transcribe(
    audio: Buffer,
    opts?: { language?: string; format?: string },
  ): Promise<string> {
    if (!this.apiKey) throw new Error('Deepgram API key required')

    const params = new URLSearchParams({
      model: this.model,
      ...(opts?.language !== undefined && { language: opts.language }),
    })

    const contentType = opts?.format ? `audio/${opts.format}` : 'audio/wav'

    const res = await fetch(`${this.baseUrl}/listen?${params}`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        Authorization: `Token ${this.apiKey}`,
      },
      body: audio,
      signal: AbortSignal.timeout(60_000),
    })

    if (!res.ok) throw new Error(`Deepgram STT error: ${res.status}`)

    const data = (await res.json()) as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{ transcript?: string }>
        }>
      }
    }

    return data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
  }
}

// ---------------------------------------------------------------------------
// OpenAI Whisper
// ---------------------------------------------------------------------------

class WhisperStt implements SttProvider {
  readonly name = 'whisper'
  private apiKey?: string
  private baseUrl: string
  private model: string

  constructor(opts?: { apiKey?: string; baseUrl?: string; model?: string }) {
    const apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY
    if (apiKey !== undefined) this.apiKey = apiKey
    this.baseUrl = opts?.baseUrl ?? 'https://api.openai.com/v1'
    this.model = opts?.model ?? 'whisper-1'
  }

  async transcribe(
    audio: Buffer,
    opts?: { language?: string },
  ): Promise<string> {
    if (!this.apiKey) throw new Error('OpenAI API key required for Whisper')

    const formData = new FormData()
    formData.append(
      'file',
      new Blob([audio], { type: 'audio/wav' }),
      'audio.wav',
    )
    formData.append('model', this.model)
    if (opts?.language) {
      formData.append('language', opts.language)
    }

    const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(60_000),
    })

    if (!res.ok) throw new Error(`Whisper STT error: ${res.status}`)

    const data = (await res.json()) as { text?: string }
    return data.text ?? ''
  }
}
