// Typed wrappers around runtime.sendMessage / runtime.onMessage.
// All cross-context communication goes through these helpers so the type
// system catches missing fields at compile time.

import browser from 'webextension-polyfill';
import type { Message, MessageResponse } from './types';

export async function sendMessage(message: Message): Promise<MessageResponse> {
  try {
    const reply = (await browser.runtime.sendMessage(message)) as MessageResponse | undefined;
    if (!reply) return { ok: false, error: 'empty reply' };
    return reply;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendMessageToTab(tabId: number, message: Message): Promise<MessageResponse> {
  try {
    const reply = (await browser.tabs.sendMessage(tabId, message)) as MessageResponse | undefined;
    if (!reply) return { ok: false, error: 'empty reply' };
    return reply;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type MessageHandler<M extends Message = Message> = (
  message: M,
  sender: browser.Runtime.MessageSender,
) => Promise<MessageResponse> | MessageResponse;

export function onMessage(handler: MessageHandler): () => void {
  const listener = (
    message: unknown,
    sender: browser.Runtime.MessageSender,
  ): false | Promise<MessageResponse> => {
    // Return false (not true) for unrecognised messages — otherwise Chrome
    // keeps the reply channel open and the other side waits forever.
    if (!isMessage(message)) return false;
    const result = handler(message, sender);
    if (isPromise(result)) return result;
    return Promise.resolve(result);
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}

function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false;
  if (!('type' in value) || typeof (value as { type: unknown }).type !== 'string') return false;
  return true;
}

function isPromise<T>(value: unknown): value is Promise<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
