declare module 'cloudflare' {
  export default class Cloudflare {
    constructor(config: any);
    ai: any;
    accounts: any;
    gateway: any;
    user: any;
  }
}
declare module '*.md' {
  const content: string;
  export default content;
}