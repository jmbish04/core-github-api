/**
 * @file EngineerAgent/methods/sandbox/ports/types.ts
 * @description Types for the ports networking category.
 */

export interface PortOptions {
  /** Port number to expose/close. */
  port: number;
  /** Optional protocol. Defaults to "tcp". */
  protocol?: "tcp" | "udp";
}
