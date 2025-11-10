export function broadcast(sockets: WebSocket[], message: any, MimeType = "application/json") {
  const payload = MimeType === "application/json" ? JSON.stringify(message) : message;
  sockets.forEach((socket) => {
    if (socket.readyState === WebSocket.READY_STATE_OPEN) {
      socket.send(payload);
    }
  });
}

export function parseMessage(message: string | ArrayBuffer) {
  try {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}
