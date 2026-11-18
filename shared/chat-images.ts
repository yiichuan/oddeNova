export function hasImageMessages(messages: unknown): boolean {
  return Array.isArray(messages) && messages.some(message =>
    message?.role === 'user' && Array.isArray(message.content) &&
    message.content.some((block: unknown) =>
      block !== null && typeof block === 'object' && 'type' in block && block.type === 'image_url',
    ),
  );
}
