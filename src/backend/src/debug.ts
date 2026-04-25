type MapEnv = {
  [K in keyof Env]: Env[K];
}
export const x: MapEnv = {} as any;
