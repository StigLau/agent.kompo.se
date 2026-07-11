# Chat Workflow

Send natural-language messages to the AI assistant to discuss ideas, plan a komposition,
or trigger multi-step workflows (image generation, video builds).

## Endpoints

### Main chat

```
POST /api/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "create a video with background music",
  "llm_provider": "sonnet|haiku|gemini",  // optional, default: haiku
  "conversation_history": [
    { "role": "user|assistant", "content": "..." }
  ],
  "current_komposition_content": "# My Komposition\n..."
}
```

Response:

```json
{
  "success": true,
  "response": "I'll help you create...",
  "komposition": "# My Video\n...",
  "llm_metadata": {
    "model": "claude-haiku-4-5-20251001",
    "provider": "anthropic",
    "tokens_used": 1234,
    "tool_iterations": 1,
    "generated_files": ["abc123"]
  }
}
```

The chat endpoint can invoke tools automatically:
- `generate_image` — generate an AI image and save it to your library.

### Multimedia panel chat

```
POST /api/multimedia/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "Generate a sunset over mountains",
  "conversation_history": [
    { "role": "user|assistant", "content": "..." }
  ],
  "llm_provider": "flash|pro",       // optional, default: flash
  "reference_image": {               // optional
    "data": "base64-without-prefix",
    "mimeType": "image/jpeg"
  }
}
```

Response:

```json
{
  "success": true,
  "response": "I've generated a beautiful sunset...",
  "generated_files": [
    { "file_id": "abc123", "width": 1920, "height": 1080 }
  ],
  "llm_metadata": {
    "model": "gemini-2.0-flash-exp",
    "provider": "gemini",
    "tool_iterations": 1
  }
}
```

## Chat message history

Each komposition has its own threaded chat history.

```
GET /api/chat-messages?kompositionId={id}&limit={n}
Authorization: Bearer <token>
```

Response:

```json
{
  "messages": [
    {
      "kompositionId": "...",
      "timestamp": 123456,
      "role": "user|assistant",
      "content": "..."
    }
  ],
  "hasOlder": true,
  "totalCount": 42
}
```

```
POST /api/chat-messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "kompositionId": "uuid",
  "role": "user",
  "content": "Hello..."
}
```

```
DELETE /api/chat-messages/{kompositionId}/{timestamp}
Authorization: Bearer <token>
```
