export interface EmbeddingProvider {
  embed(text: string): Promise<Float32Array>
  embedBatch(texts: string[]): Promise<Float32Array[]>
  readonly dimensions: number
}

export type EmbeddingProviderName =
  | 'openai'
  | 'ollama'
  | 'voyage'
  | 'mistral'
  | 'gemini'

export function createEmbeddingProvider(
  provider: EmbeddingProviderName,
  model: string,
  opts?: { apiKey?: string; baseUrl?: string; dimensions?: number },
): EmbeddingProvider {
  switch (provider) {
    case 'ollama':
      return new OllamaEmbeddingProvider(model, opts)
    case 'openai': {
      const apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY
      return new HttpEmbeddingProvider({
        model,
        baseUrl: opts?.baseUrl ?? 'https://api.openai.com/v1',
        ...(apiKey !== undefined && { apiKey }),
        dimensions: opts?.dimensions ?? 1536,
        authHeader: 'Authorization',
        authPrefix: 'Bearer ',
      })
    }
    case 'voyage': {
      const apiKey = opts?.apiKey ?? process.env.VOYAGE_API_KEY
      return new HttpEmbeddingProvider({
        model,
        baseUrl: opts?.baseUrl ?? 'https://api.voyageai.com/v1',
        ...(apiKey !== undefined && { apiKey }),
        dimensions: opts?.dimensions ?? 1024,
        authHeader: 'Authorization',
        authPrefix: 'Bearer ',
      })
    }
    case 'mistral': {
      const apiKey = opts?.apiKey ?? process.env.MISTRAL_API_KEY
      return new HttpEmbeddingProvider({
        model,
        baseUrl: opts?.baseUrl ?? 'https://api.mistral.ai/v1',
        ...(apiKey !== undefined && { apiKey }),
        dimensions: opts?.dimensions ?? 1024,
        authHeader: 'Authorization',
        authPrefix: 'Bearer ',
      })
    }
    case 'gemini':
      return new GeminiEmbeddingProvider(model, opts)
  }
}

// ---------------------------------------------------------------------------
// Ollama (local, no key)
// ---------------------------------------------------------------------------

class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number
  private baseUrl: string
  private model: string

  constructor(model: string, opts?: { baseUrl?: string; dimensions?: number }) {
    this.model = model
    this.baseUrl = opts?.baseUrl ?? 'http://localhost:11434'
    this.dimensions = opts?.dimensions ?? 768
  }

  async embed(text: string): Promise<Float32Array> {
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: text }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      throw new Error(`Ollama embed error: ${response.status}`)
    }

    const data = (await response.json()) as {
      embeddings: number[][]
    }
    return new Float32Array(data.embeddings[0]!)
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!response.ok) {
      throw new Error(`Ollama embed error: ${response.status}`)
    }

    const data = (await response.json()) as {
      embeddings: number[][]
    }
    return data.embeddings.map((e) => new Float32Array(e))
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible HTTP provider (OpenAI, Voyage, Mistral)
// ---------------------------------------------------------------------------

class HttpEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number
  private model: string
  private baseUrl: string
  private apiKey?: string
  private authHeader: string
  private authPrefix: string

  constructor(opts: {
    model: string
    baseUrl: string
    apiKey?: string
    dimensions: number
    authHeader: string
    authPrefix: string
  }) {
    this.model = opts.model
    this.baseUrl = opts.baseUrl
    if (opts.apiKey !== undefined) this.apiKey = opts.apiKey
    this.dimensions = opts.dimensions
    this.authHeader = opts.authHeader
    this.authPrefix = opts.authPrefix
  }

  async embed(text: string): Promise<Float32Array> {
    const results = await this.embedBatch([text])
    return results[0]!
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (!this.apiKey) {
      throw new Error('API key required for embedding provider')
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [this.authHeader]: `${this.authPrefix}${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`)
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>
    }
    return data.data.map((d) => new Float32Array(d.embedding))
  }
}

// ---------------------------------------------------------------------------
// Gemini (different API format)
// ---------------------------------------------------------------------------

class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number
  private model: string
  private apiKey?: string
  private baseUrl: string

  constructor(
    model: string,
    opts?: { apiKey?: string; baseUrl?: string; dimensions?: number },
  ) {
    this.model = model
    const apiKey = opts?.apiKey ?? process.env.GOOGLE_API_KEY
    if (apiKey !== undefined) this.apiKey = apiKey
    this.baseUrl =
      opts?.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta'
    this.dimensions = opts?.dimensions ?? 768
  }

  async embed(text: string): Promise<Float32Array> {
    const results = await this.embedBatch([text])
    return results[0]!
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (!this.apiKey) {
      throw new Error('Google API key required for Gemini embeddings')
    }

    const requests = texts.map((text) => ({
      model: `models/${this.model}`,
      content: { parts: [{ text }] },
    }))

    const response = await fetch(
      `${this.baseUrl}/models/${this.model}:batchEmbedContents?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
        signal: AbortSignal.timeout(30_000),
      },
    )

    if (!response.ok) {
      throw new Error(`Gemini embed error: ${response.status}`)
    }

    const data = (await response.json()) as {
      embeddings: Array<{ values: number[] }>
    }
    return data.embeddings.map((e) => new Float32Array(e.values))
  }
}
