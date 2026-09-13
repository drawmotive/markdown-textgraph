export function createRenderer(renderPng) {
  const calls = [];
  let disposeCount = 0;

  return {
    calls,
    get disposeCount() {
      return disposeCount;
    },
    renderer: {
      async renderPng(source) {
        calls.push(source);
        return renderPng
          ? renderPng(source)
          : {
              success: true,
              png: Buffer.from(source).toString('base64'),
              width: 2,
              height: 1,
              diagnostics: [],
            };
      },
      async dispose() {
        disposeCount += 1;
      },
    },
  };
}

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
