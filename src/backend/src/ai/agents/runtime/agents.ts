

export function callable(_config?: unknown): any {
  return function (value: any, context?: any, descriptor?: any) {
    if (descriptor) {
      return descriptor;
    }
    return value;
  };
}

