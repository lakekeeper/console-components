import { ref, type Ref } from 'vue';
import * as webllm from '@mlc-ai/web-llm';

let engineInstance: webllm.MLCEngine | null = null;

export interface WebLLMConfig {
  modelId?: string;
  onProgress?: (progress: webllm.InitProgressReport) => void;
}

export function useWebLLM() {
  const isInitialized: Ref<boolean> = ref(false);
  const isInitializing: Ref<boolean> = ref(false);
  const error: Ref<string | null> = ref(null);
  const loadingProgress: Ref<string> = ref('');

  /**
   * Available models optimized for different use cases
   * See: https://github.com/mlc-ai/web-llm#models
   */
  const availableModels = [
    {
      id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
      name: 'Llama 3.1 8B (Recommended, ~5GB)',
      description: 'Best for SQL and complex reasoning',
    },
    {
      id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
      name: 'Qwen 2.5 7B (~4.5GB)',
      description: 'Excellent for coding and SQL tasks',
    },
    {
      id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
      name: 'Llama 3.2 3B (Fast, ~2GB)',
      description: 'Good balance of speed and quality',
    },
    {
      id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
      name: 'Phi 3.5 Mini (~2.5GB)',
      description: 'Microsoft model, good accuracy',
    },
    {
      id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      name: 'Llama 3.2 1B (Fastest, ~800MB)',
      description: 'Fastest option for simple queries',
    },
  ];

  /**
   * Initialize WebLLM engine with selected model
   */
  async function initialize(config?: WebLLMConfig): Promise<void> {
    if (isInitialized.value || isInitializing.value) {
      return;
    }

    isInitializing.value = true;
    error.value = null;
    loadingProgress.value = 'Starting initialization...';

    try {
      const modelId = config?.modelId || 'Qwen2.5-7B-Instruct-q4f16_1-MLC';

      // Create engine with progress tracking
      engineInstance = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (progress: webllm.InitProgressReport) => {
          // Update progress
          loadingProgress.value = progress.text;
          console.log('[WebLLM]', progress.text, `${Math.round(progress.progress * 100)}%`);

          // Call custom progress callback if provided
          if (config?.onProgress) {
            config.onProgress(progress);
          }
        },
        logLevel: 'WARN', // Less verbose logging
      });

      isInitialized.value = true;
      loadingProgress.value = 'Model loaded successfully';
      console.log('[WebLLM] Engine initialized successfully');
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to initialize WebLLM';
      console.error('[WebLLM] Initialization error:', e);
      throw e;
    } finally {
      isInitializing.value = false;
    }
  }

  /**
   * Generate text completion from prompt
   */
  async function generate(
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      stopTokens?: string[];
    },
  ): Promise<string> {
    if (!engineInstance) {
      throw new Error('WebLLM engine not initialized. Call initialize() first.');
    }

    try {
      const response = await engineInstance.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 2048,
        stop: options?.stopTokens,
      });

      const content = response.choices[0]?.message?.content || '';
      return content;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Generation failed';
      console.error('[WebLLM] Generation error:', e);
      throw new Error(`WebLLM generation failed: ${errorMsg}`);
    }
  }

  /**
   * Stream text generation (for better UX with large responses)
   */
  async function* generateStream(
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
    },
  ): AsyncGenerator<string, void, unknown> {
    if (!engineInstance) {
      throw new Error('WebLLM engine not initialized. Call initialize() first.');
    }

    try {
      const chunks = await engineInstance.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 2048,
        stream: true,
      });

      for await (const chunk of chunks) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          yield content;
        }
      }
    } catch (e) {
      console.error('[WebLLM] Stream generation error:', e);
      throw e;
    }
  }

  /**
   * Reset chat history (for multi-turn conversations)
   */
  async function resetChat(): Promise<void> {
    if (engineInstance) {
      await engineInstance.resetChat();
    }
  }

  /**
   * Cleanup and dispose of engine resources
   */
  async function dispose(): Promise<void> {
    if (engineInstance) {
      engineInstance.unload();
      engineInstance = null;
      isInitialized.value = false;
      loadingProgress.value = '';
      console.log('[WebLLM] Engine disposed');
    }
  }

  /**
   * Get usage statistics
   */
  function getRuntimeStats() {
    if (!engineInstance) return null;
    return engineInstance.runtimeStatsText();
  }

  return {
    isInitialized,
    isInitializing,
    error,
    loadingProgress,
    availableModels,
    initialize,
    generate,
    generateStream,
    resetChat,
    dispose,
    getRuntimeStats,
  };
}
