declare module "cloudflare" {
  export interface CloudflareClientOptions {
    apiToken: string;
  }

  export default class Cloudflare {
    constructor(options: CloudflareClientOptions);
    user: {
      tokens: {
        verify(): Promise<any>;
      };
    };
    accounts: {
      tokens: {
        verify(params: { account_id: string }): Promise<any>;
      };
    };
    ai: {
      models: {
        list(params: { account_id: string; search?: string }): Promise<{ result: any[] }>;
      };
    };
  }
}
