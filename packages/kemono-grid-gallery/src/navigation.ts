export interface UserPath {
  service: string;
  userId: string;
}

type HistoryMethodName = 'pushState' | 'replaceState';

const navigationState = { lastUrl: location.href };

export function getCurrentUserPath(): UserPath | null {
  const match = location.pathname.match(/^\/([^/]+)\/user\/([^/]+)\/?$/);

  if (!match) {
    return null;
  }

  const [, service, userId] = match;

  return { service, userId };
}

function setupHistoryListener(methodName: HistoryMethodName, handleUrlChange: () => void): void {
  const originalMethod: History['pushState'] = history[methodName];
  const wrappedMethod: History['pushState'] = function (...args) {
    const result = Reflect.apply(originalMethod, history, args);

    handleUrlChange();

    return result;
  };

  history[methodName] = wrappedMethod;
}

export function setupUrlChangeListener(onUrlChange: () => void): void {
  const handleUrlChange = (): void => {
    if (location.href === navigationState.lastUrl) {
      return;
    }

    navigationState.lastUrl = location.href;
    onUrlChange();
  };
  const observer = new MutationObserver(handleUrlChange);

  observer.observe(document.body, { childList: true, subtree: true });
  addEventListener('popstate', handleUrlChange);

  setupHistoryListener('pushState', handleUrlChange);
  setupHistoryListener('replaceState', handleUrlChange);
}
