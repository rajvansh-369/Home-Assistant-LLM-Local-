// A random v4 UUID for chats and messages (docs/aster-home-chat-plan.md §7). It is an idempotency
// key for uploads, not a secret, so Math.random is enough and no native crypto module is needed.
export function uuidV4(): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}
