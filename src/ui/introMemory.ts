/** 記錄「開場看過了沒」。localStorage 在私密瀏覽等情況可能不能用，所以全部包 try/catch。 */
export const INTRO_SEEN_KEY = 'sealFacility.introSeen.v1';

type KV = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): KV | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function hasSeenIntro(storage: KV | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntroSeen(storage: KV | null = defaultStorage()): void {
  try {
    storage?.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    /* 存不了就算了，下次會再播一次 */
  }
}
