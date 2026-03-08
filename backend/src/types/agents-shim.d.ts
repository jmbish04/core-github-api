declare module "agents" {
  export function callable(config?: any): any;
  export class Agent {
    constructor(...args: any[]);
  }
}
