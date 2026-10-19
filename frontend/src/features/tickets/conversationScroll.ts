interface ScrollViewport { scrollTop: number; scrollHeight: number; clientHeight: number }

// Follow the latest messages unless the agent deliberately scrolls into history.
// Hidden retained sections have no height; they must not reset that preference.
export function createConversationScroll(viewport: ScrollViewport) {
  let following = true;
  const sync = () => {
    if (following && viewport.clientHeight > 0) viewport.scrollTop = viewport.scrollHeight;
  };
  return {
    sync,
    onScroll: () => {
      if (viewport.clientHeight > 0) following = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 64;
    },
    latest: () => { following = true; sync(); },
  };
}
