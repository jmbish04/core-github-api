import type { DictationAdapter } from "@assistant-ui/react";

export class CloudflareWhisperAdapter implements DictationAdapter {
  private endpoint: string;
  public disableInputDuringDictation: boolean;

  constructor(options?: { endpoint?: string; disableInputDuringDictation?: boolean }) {
    // Determine the transcription endpoint url
    this.endpoint = options?.endpoint || "/api/agents/transcribe";
    // Whisper via REST returns the full transcript at once, so typing simultaneously is disabled by default
    this.disableInputDuringDictation = options?.disableInputDuringDictation ?? true;
  }

  static isSupported(): boolean {
    return true; // Cloudflare Workers AI Whisper is always supported via REST
  }

  listen(): DictationAdapter.Session {
    const callbacks = {
      start: new Set<() => void>(),
      end: new Set<(r: DictationAdapter.Result) => void>(),
      speech: new Set<(r: DictationAdapter.Result) => void>(),
    };

    let mediaRecorder: MediaRecorder | null = null;
    let audioChunks: Blob[] = [];
    let isCancelled = false;
    let currentStatus: DictationAdapter.Status = { type: "starting" };

    const session: DictationAdapter.Session = {
      get status() { return currentStatus; },

      stop: async () => {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        }
      },

      cancel: () => {
        isCancelled = true;
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        }
      },

      onSpeechStart: (cb) => {
        callbacks.start.add(cb);
        return () => callbacks.start.delete(cb);
      },

      onSpeechEnd: (cb) => {
        callbacks.end.add(cb);
        return () => callbacks.end.delete(cb);
      },

      onSpeech: (cb) => {
        callbacks.speech.add(cb);
        return () => callbacks.speech.delete(cb);
      },
    };

    if (!navigator.mediaDevices || !window.MediaRecorder) {
      console.error("Audio recording is not supported by this browser.");
      currentStatus = { type: "ended", reason: "error" };
      return session;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        currentStatus = { type: "running" };
        for (const cb of callbacks.start) cb();
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());

        if (isCancelled) {
          currentStatus = { type: "ended", reason: "cancelled" };
          return;
        }

        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        audioChunks = []; // clear buffer
        
        try {
          const arrayBuffer = await audioBlob.arrayBuffer();
          const response = await fetch(this.endpoint, {
            method: "POST",
            body: arrayBuffer,
            headers: {
              "Content-Type": "application/octet-stream"
            }
          });

          if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
          }

          const data = await response.json() as { text?: string };

          if (data && data.text) {
            // Commit the final transcribed text to the composer input
            for (const cb of callbacks.speech) {
              cb({ transcript: data.text, isFinal: true });
            }
            // Trigger the end event with the final result
            for (const cb of callbacks.end) {
              cb({ transcript: data.text });
            }
          }
          currentStatus = { type: "ended", reason: "stopped" };
        } catch (error) {
          console.error("Cloudflare Whisper transcription failed:", error);
          currentStatus = { type: "ended", reason: "error" };
        }
      };

      mediaRecorder.start();
    }).catch((err) => {
      console.error("Microphone access error:", err);
      currentStatus = { type: "ended", reason: "error" };
    });

    return session;
  }
}
