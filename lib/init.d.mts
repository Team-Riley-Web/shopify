export interface InitOptions {
  /** Directory to scaffold into. Default: process.cwd(). */
  cwd?: string;
  log?: (line: string) => void;
}
export interface InitResult {
  copied: string[];
  skipped: string[];
  alpineWired: boolean;
  pkgChanged: boolean;
}
export function init(options?: InitOptions): InitResult;
