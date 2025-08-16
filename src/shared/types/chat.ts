export interface ChatAPI {
  streamMessage(convoId: string, content: string): void;
  resumeMessage(convoId: string): void;
  onChunk(callback: (chunk: string) => void): () => void;
  onComplete(callback: (result: any) => void): () => void;
  onError(callback: (error: Error) => void): () => void;
}