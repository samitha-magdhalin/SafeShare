import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type NativeBridge = {
  listenForImages(handler: () => void): Promise<() => void>;
  listenForReview(handler: () => void): Promise<() => void>;
  readClipboardImage(): Promise<number[] | null>;
  writeClipboardImage(bytes: Uint8Array): Promise<void>;
  notify(): Promise<void>;
  setReviewAvailable(available: boolean): Promise<void>;
  hideReviewWindow(): Promise<void>;
  readPolicyCache(): Promise<string | null>;
  writePolicyCache(serialized: string): Promise<void>;
  setCompanyStatus(workspace: string | null, policyVersion: number | null, offline: boolean): Promise<void>;
};

export const tauriBridge: NativeBridge = {
  async listenForImages(handler) { return listen('clipboard-image-changed', handler); },
  async listenForReview(handler) { return listen('open-review', handler); },
  readClipboardImage: () => invoke('read_clipboard_image_png'),
  writeClipboardImage: bytes => invoke('write_clipboard_image_png', { bytes: Array.from(bytes) }),
  notify: () => invoke('show_attention_notification'),
  setReviewAvailable: available => invoke('set_review_available', { available }),
  hideReviewWindow: () => invoke('hide_review_window'),
  readPolicyCache: () => invoke('read_team_policy_cache'),
  writePolicyCache: serialized => invoke('write_team_policy_cache', { serialized }),
  setCompanyStatus: (workspace, policyVersion, offline) => invoke('set_company_status', { workspace, policyVersion, offline }),
};