export function wrapWithProxy<T extends object>(target: T, wrappers: Partial<T>): T {
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in wrappers) {
        return wrappers[prop as keyof T];
      }
      return (obj as any)[prop];
    },
  });
}
