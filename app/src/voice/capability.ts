// A runtime check, not a hardcoded flag like OnlinePlay.tsx's VOICE_CHAT_ENABLED — availability
// genuinely varies per browser/webview (Chrome/Android has it, Safari/iOS never does, and an
// embedded webview like WhatsApp's in-app browser may lack it even on an otherwise-Chrome-based
// device), rather than being a cost/reliability tradeoff this app is choosing to gate on.
export function isVoiceCommandsSupported(): boolean {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
