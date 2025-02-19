/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
function isPromise<T, S>(obj: PromiseLike<T> | S): obj is PromiseLike<T> {
  return (
    !!obj &&
    (typeof obj === 'object' || typeof obj === 'function') &&
    'then' in obj &&
    typeof obj.then === 'function'
  );
}

function safelyTry<T, E = Error>(
  fn: ((...args: any[]) => T) | (() => T),
  ...args: any[]
): T extends PromiseLike<any>
  ?
      | Promise<{ data: undefined; error: E }>
      | Promise<{ data: Awaited<T>; error: undefined }>
  : { data: undefined; error: E } | { data: T; error: undefined } {
  try {
    // try calling the function
    const x = fn(...args);

    // asynchronous functions
    if (isPromise(x)) {
      // @ts-ignore
      return Promise.resolve(x).then(
        (value) => ({ data: value as Awaited<T>, error: undefined }),
        (error) => ({ data: undefined, error: error as E }),
      );
    }

    // synchronous functions
    // @ts-ignore
    return { data: x, error: undefined };
  } catch (error) {
    // @ts-ignore
    return { data: undefined, error: error as E };
  }
}

export default safelyTry;
